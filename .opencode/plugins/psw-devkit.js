/**
 * PSW DevKit Plugin para OpenCode.ai
 *
 * Plugin distribuible unificado que registra skills, inyecta contexto
 * empresarial, y sincroniza agents/commands al proyecto del usuario.
 *
 * IMPORTANTE: OpenCode descubre agents/commands SOLO al arrancar,
 * leyendo .opencode/agents/ y .opencode/commands/ del proyecto.
 * La sincronizacion automatica requiere un REINICIO de OpenCode.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Utilidades de copia segura                                        */
/* ------------------------------------------------------------------ */

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
  const result = { copied: [], skipped: [], errors: [], targetDir };

  if (!fs.existsSync(sourceDir)) {
    result.errors.push(`Source not found: ${sourceDir}`);
    return result;
  }

  for (const dir of ['agents', 'commands', 'context', 'scripts']) {
    syncDir(path.join(sourceDir, dir), path.join(targetDir, dir), result, targetDir);
  }

  syncDir(path.join(sourceDir, 'skills'), path.join(targetDir, 'skills'), result, targetDir);

  return result;
}

/* ------------------------------------------------------------------ */
/*  Deteccion robusta de la raiz del proyecto                         */
/* ------------------------------------------------------------------ */

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

  // Directorio raiz del paquete psw-devkit (para evitar copiar sobre si mismo)
  const pluginRoot = path.resolve(__dirname, '..', '..');

  // Estado compartido
  let syncResult   = null;
  let projectRoot  = null;
  let needsRestart = false;
  let agentsFound  = false;

  function attemptSync(targetDir) {
    if (!targetDir) {
      return { copied: [], skipped: [], errors: ['No se pudo detectar la raiz del proyecto'] };
    }
    if (path.resolve(targetDir) === path.resolve(pluginRoot)) {
      return { copied: [], skipped: [], errors: [], _skippedDev: true };
    }
    try {
      return doSync(targetDir, pluginOpencodeDir);
    } catch (err) {
      return { copied: [], skipped: [], errors: [err.message] };
    }
  }

  function checkAgents(projectDir) {
    if (!projectDir) return false;
    const agentsDir = path.join(projectDir, '.opencode', 'agents');
    if (!fs.existsSync(agentsDir)) return false;
    return fs.readdirSync(agentsDir).some(f => f.endsWith('.md'));
  }

  return {
    /* ----------------------------------------------------------------
       Hook CONFIG — registra skills. La sincronizacion de archivos se
       hace en session.created donde tenemos acceso a client.project.
       ---------------------------------------------------------------- */
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      for (const cat of ['dotnet', 'methodology', 'rag', 'utils']) {
        const p = path.join(skillsPath, cat);
        if (fs.existsSync(p) && !config.skills.paths.includes(p)) {
          config.skills.paths.push(p);
        }
      }

      config.agents = config.agents || { paths: [] };
      if (!config.agents.paths.includes(agentsPath)) {
        config.agents.paths.push(agentsPath);
      }
      config.commands = config.commands || { paths: [] };
      if (!config.commands.paths.includes(commandsPath)) {
        config.commands.paths.push(commandsPath);
      }

      config.psw_devkit = {
        scripts_path: scriptsPath,
        context_path: contextPath,
        version: '1.0.2'
      };
    },

    /* ----------------------------------------------------------------
       Hook SESSION.CREATED — detecta proyecto, sincroniza, reporta.
       ---------------------------------------------------------------- */
    'session.created': async ({ client }) => {
      // ---- Paso 1: detectar raiz del proyecto ----
      const candidates = [];

      // 1a) directory pasado por OpenCode
      if (directory) {
        candidates.push({ source: 'directory', path: path.resolve(directory) });
      }

      // 1b) API del SDK (la mas confiable)
      if (client?.project?.current) {
        try {
          const proj = await client.project.current();
          if (proj?.path) {
            candidates.push({ source: 'client.project.current()', path: path.resolve(proj.path) });
          }
        } catch (_e) {}
      }

      // 1c) buscar desde cwd
      const fromCwd = findProjectRoot(process.cwd());
      if (fromCwd) {
        candidates.push({ source: 'cwd', path: fromCwd });
      }

      // 1d) buscar desde el directorio del plugin hacia arriba
      const fromPlugin = findProjectRoot(path.resolve(__dirname, '..', '..', '..'));
      if (fromPlugin) {
        candidates.push({ source: 'plugin-parent', path: fromPlugin });
      }

      // Elegir el primer candidato que NO sea el repo del plugin
      for (const c of candidates) {
        if (path.resolve(c.path) !== path.resolve(pluginRoot)) {
          projectRoot = c.path;
          break;
        }
      }

      // ---- Paso 2: verificar si agents ya existen ----
      agentsFound = checkAgents(projectRoot);

      // ---- Paso 3: sincronizar ----
      if (!agentsFound) {
        syncResult = attemptSync(projectRoot);
        needsRestart = syncResult && syncResult.copied.length > 0;
        if (needsRestart) agentsFound = checkAgents(projectRoot);
      } else {
        syncResult = { copied: [], skipped: [], errors: [], _alreadyPresent: true };
        needsRestart = false;
      }

      // ---- Paso 4: logging ----
      await client.app.log({
        body: {
          service: 'psw-devkit',
          level: 'info',
          message: 'PSW DevKit v1.0.2 initialized',
          enterprise_context_loaded: hasEnterpriseCtx,
          project_root_detected: projectRoot,
          project_root_source: candidates.find(c => c.path === projectRoot)?.source || 'none',
          agents_found: agentsFound,
          sync_copied: syncResult ? syncResult.copied.length : 0,
          sync_skipped: syncResult ? syncResult.skipped.length : 0,
          sync_errors: syncResult ? syncResult.errors.length : 0,
          needs_restart: needsRestart
        }
      });

      if (syncResult && syncResult.copied.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'info',
            message: `PSW DevKit: ${syncResult.copied.length} archivos sincronizados a .opencode/`,
            action_required: 'REINICIA OPENCODE para que los agents y commands aparezcan'
          }
        });
      }

      if (syncResult && syncResult.errors.length > 0) {
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level: 'warn',
            message: 'PSW DevKit: sincronizacion automatica fallo',
            errors: syncResult.errors,
            detected_project_root: projectRoot,
            solution: 'Ejecuta manualmente desde la raiz de tu proyecto: npx psw-devkit-init'
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

    /* ----------------------------------------------------------------
       Inyeccion de contexto empresarial.
       ---------------------------------------------------------------- */
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
