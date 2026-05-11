/**
 * PSW DevKit Plugin para OpenCode.ai
 *
 * Plugin distribuible unificado que registra:
 * - Skills de .NET, methodology, RAG y utils
 * - Agents (orchestrator + 6 specialists)
 * - Commands slash
 * - Scaffolding templates
 * - Contexto empresarial
 *
 * ESTRATEGIA: OpenCode descubre agents/commands durante el arranque
 * leyendo el objeto config.  Este plugin inyecta agents/commands
 * directamente en config.agent / config.command desde el hook `config`,
 * garantizando que esten disponibles INMEDIATAMENTE sin copiar archivos
 * ni reiniciar.  Ademas sincroniza archivos .md al proyecto para
 * persistencia entre sesiones.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Utilidades                                                        */
/* ------------------------------------------------------------------ */

/** Parsea frontmatter YAML simple (solo primer nivel + permission anidado). */
function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!m) return null;

  const meta = {};
  let currentKey = null;
  for (const line of m[1].split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const indent = trimmed.search(/\S/);
    const kv = trimmed.match(/^(\w+):\s*(.*)$/);

    if (indent === 0 && kv) {
      currentKey = kv[1];
      const val = kv[2].trim();
      meta[currentKey] = val || {};
    } else if (indent > 0 && currentKey && typeof meta[currentKey] === 'object' && kv) {
      meta[currentKey][kv[1]] = kv[2].trim();
    }
  }
  return { meta, body: m[2] };
}

/** Lee todos los archivos .md de un directorio y retorna [{name, meta, body}]. */
function loadMarkdownFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir)) {
      const full = path.join(currentDir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.md')) {
        const content = fs.readFileSync(full, 'utf8');
        const parsed = parseFrontmatter(content);
        if (parsed && parsed.meta.name) {
          results.push({
            name: parsed.meta.name,
            meta: parsed.meta,
            body: parsed.body
          });
        }
      }
    }
  }
  walk(dir);
  return results;
}

/** Copia recursiva segura (no sobrescribe). */
function copyRecursive(src, dest, opts = {}) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry), opts);
    }
  } else {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (opts.onCopied) opts.onCopied(src, dest);
    } else {
      if (opts.onSkipped) opts.onSkipped(src, dest);
    }
  }
}

function syncDir(src, dest, result, rootTarget) {
  if (!fs.existsSync(src)) return;
  try {
    copyRecursive(src, dest, {
      onCopied: (_s, d) => result.copied.push(path.relative(rootTarget, d)),
      onSkipped: (_s, d) => result.skipped.push(path.relative(rootTarget, d))
    });
  } catch (err) {
    result.errors.push(`Failed to sync ${path.basename(src)}: ${err.message}`);
  }
}

function doSync(projectDir, sourceDir) {
  const targetDir = path.join(projectDir, '.opencode');
  const result = { copied: [], skipped: [], errors: [] };
  if (!fs.existsSync(sourceDir)) {
    result.errors.push(`Source not found: ${sourceDir}`);
    return result;
  }
  for (const dir of ['agents', 'commands', 'context', 'scripts', 'skills']) {
    syncDir(path.join(sourceDir, dir), path.join(targetDir, dir), result, targetDir);
  }
  return result;
}

function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'opencode.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.opencode', 'opencode.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Plugin principal                                                  */
/* ------------------------------------------------------------------ */

export const PSWDevKitPlugin = async ({ client, directory }) => {
  const pluginOpencodeDir = path.resolve(__dirname, '..');
  const skillsPath        = path.join(pluginOpencodeDir, 'skills');
  const agentsPath        = path.join(pluginOpencodeDir, 'agents');
  const commandsPath      = path.join(pluginOpencodeDir, 'commands');
  const scriptsPath       = path.join(pluginOpencodeDir, 'scripts');
  const contextPath       = path.join(pluginOpencodeDir, 'context', 'enterprise.yaml');
  const hasEnterpriseCtx  = fs.existsSync(contextPath);
  const pluginRoot        = path.resolve(__dirname, '..', '..');

  let syncResult = null;
  let projectRoot = null;

  function attemptSync(targetDir) {
    if (!targetDir) return { copied: [], skipped: [], errors: ['No project directory'] };
    if (path.resolve(targetDir) === path.resolve(pluginRoot)) {
      return { copied: [], skipped: [], errors: [], _skippedDev: true };
    }
    try { return doSync(targetDir, pluginOpencodeDir); }
    catch (err) { return { copied: [], skipped: [], errors: [err.message] }; }
  }

  return {
    /* ================================================================
       HOOK CONFIG  —  se ejecuta ANTES de que OpenCode descubra agents
       ================================================================ */
    config: async (config) => {
      // ---- 1. Skills (paths) ----
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      for (const cat of ['dotnet', 'methodology', 'rag', 'utils']) {
        const p = path.join(skillsPath, cat);
        if (fs.existsSync(p) && !config.skills.paths.includes(p)) {
          config.skills.paths.push(p);
        }
      }

      // ---- 2. Agents  —  INYECCION DIRECTA EN CONFIG ----
      // OpenCode lee config.agent para descubrir agents.  Inyectamos
      // agents directamente para que esten disponibles INMEDIATAMENTE.
      config.agent = config.agent || {};
      const agentFiles = loadMarkdownFiles(agentsPath);
      for (const { name, meta, body } of agentFiles) {
        if (!name || config.agent[name]) continue; // No sobrescribir existentes
        config.agent[name] = {
          description: meta.description || `Agent ${name}`,
          mode: meta.mode || 'subagent',
          prompt: body.trim()
        };
        if (meta.model) config.agent[name].model = meta.model;
        if (meta.temperature) config.agent[name].temperature = parseFloat(meta.temperature);
        if (meta.permission) {
          config.agent[name].permission = {};
          for (const [k, v] of Object.entries(meta.permission)) {
            config.agent[name].permission[k] = v;
          }
        }
      }

      // ---- 3. Commands  —  INYECCION DIRECTA EN CONFIG ----
      config.command = config.command || {};
      const commandFiles = loadMarkdownFiles(commandsPath);
      for (const { name, meta, body } of commandFiles) {
        if (!name || config.command[name]) continue;
        config.command[name] = {
          description: meta.description || `Command /${name}`,
          template: body.trim()
        };
        if (meta.agent) config.command[name].agent = meta.agent;
        if (meta.model) config.command[name].model = meta.model;
        if (meta.subtask) config.command[name].subtask = meta.subtask === 'true' || meta.subtask === true;
      }

      // ---- 4. Metadatos ----
      config.psw_devkit = {
        scripts_path: scriptsPath,
        context_path: contextPath,
        version: '1.0.3',
        agents_injected: agentFiles.length,
        commands_injected: commandFiles.length
      };

      // ---- 5. Sincronizar archivos al proyecto (para persistencia) ----
      const candidates = [];
      if (directory) candidates.push(path.resolve(directory));
      const fromCwd = findProjectRoot(process.cwd());
      if (fromCwd) candidates.push(fromCwd);
      const fromPlugin = findProjectRoot(path.resolve(__dirname, '..', '..', '..'));
      if (fromPlugin) candidates.push(fromPlugin);

      for (const c of candidates) {
        if (path.resolve(c) !== path.resolve(pluginRoot)) {
          projectRoot = c;
          break;
        }
      }
      syncResult = attemptSync(projectRoot);
    },

    /* ================================================================
       HOOK SESSION.CREATED  —  reporte de estado
       ================================================================ */
    'session.created': async ({ client }) => {
      await client.app.log({
        body: {
          service: 'psw-devkit',
          level: 'info',
          message: 'PSW DevKit v1.0.3 initialized',
          enterprise_context_loaded: hasEnterpriseCtx,
          agents_injected: (syncResult && syncResult._skippedDev) ? 'dev-skipped' : 'injected-via-config',
          sync_copied: syncResult ? syncResult.copied.length : 0,
          sync_errors: syncResult ? syncResult.errors.length : 0,
          project_root: projectRoot
        }
      });

      if (syncResult && syncResult.copied.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'info',
            message: `PSW DevKit: ${syncResult.copied.length} archivos sincronizados a .opencode/`,
            detail: 'Los agents y commands YA estan disponibles (inyectados en config). ' +
                    'Los archivos sincronizados garantizan persistencia para futuras sesiones.'
          }
        });
      }

      if (syncResult && syncResult.errors.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'warn',
            message: 'PSW DevKit: sincronizacion de archivos fallo',
            errors: syncResult.errors,
            solution: 'Ejecuta manualmente: npx psw-devkit-init'
          }
        });
      }

      if (hasEnterpriseCtx) {
        const ctx = fs.readFileSync(contextPath, 'utf8');
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'info',
            message: 'Enterprise context loaded',
            context_preview: ctx.substring(0, 200) + '...'
          }
        });
      }
    },

    /* ================================================================
       Inyeccion de contexto empresarial
       ================================================================ */
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!hasEnterpriseCtx || !output.messages.length) return;

      const firstUser = output.messages.find(m => m.info.role === 'user');
      if (!firstUser || !firstUser.parts.length) return;
      if (firstUser.parts.some(p => p.type === 'text' && p.text.includes('[PSW_DEVKIT_CONTEXT]'))) return;

      const ctx = fs.readFileSync(contextPath, 'utf8');
      const injection = `[PSW_DEVKIT_CONTEXT]\nEste es el contexto empresarial del equipo PSW. DEBES seguir estas reglas:\n\n${ctx}\n\n[FIN CONTEXT]\n\n`;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: 'text', text: injection });
    }
  };
};
