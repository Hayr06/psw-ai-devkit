/**
 * PSW DevKit Plugin para OpenCode.ai  (v1.0.4-fixed)
 *
 * Correcciones:
 * 1. Resolución robusta de paths cuando el plugin se instala desde git
 * 2. Uso prioritario del `directory` pasado por OpenCode
 * 3. Logging de debug en cada paso crítico
 * 4. Manejo de errores en client.app.log
 * 5. Skills paths relativos al proyecto cuando es posible
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
      // Si el valor está vacío, preparamos objeto para claves anidadas
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
  if (!fs.existsSync(src)) {
    result.errors.push(`Source not found: ${src}`);
    return;
  }
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
  if (!startDir || !fs.existsSync(startDir)) return null;
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'opencode.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.opencode', 'opencode.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.opencode', 'opencode.jsonc'))) return dir;
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
  
  // ===== RESOLUCIÓN ROBUSTA DE PATHS =====
  // Cuando OpenCode instala desde git, el .js puede estar en un cache temporal.
  // Necesitamos detectar dónde están REALMENTE los recursos (agents, commands, etc.)
  
  const pluginFileDir = __dirname;
  
  // Opción A: los recursos están al mismo nivel que plugins/ (estructura repo)
  const siblingOpencodeDir = path.resolve(pluginFileDir, '..');
  
  // Opción B: los recursos están dos niveles arriba (si el .js está en .opencode/plugins/)
  const grandparentOpencodeDir = path.resolve(pluginFileDir, '..', '..');
  
  // Detectar cuál estructura tiene los recursos
  let pluginOpencodeDir = null;
  const candidates = [
    { dir: siblingOpencodeDir, name: 'sibling' },
    { dir: grandparentOpencodeDir, name: 'grandparent' }
  ];
  
  for (const cand of candidates) {
    const hasAgents = fs.existsSync(path.join(cand.dir, 'agents'));
    const hasCommands = fs.existsSync(path.join(cand.dir, 'commands'));
    if (hasAgents || hasCommands) {
      pluginOpencodeDir = cand.dir;
      break;
    }
  }
  
  // Fallback: si no detectamos, asumimos sibling
  if (!pluginOpencodeDir) {
    pluginOpencodeDir = siblingOpencodeDir;
  }

  const skillsPath   = path.join(pluginOpencodeDir, 'skills');
  const agentsPath   = path.join(pluginOpencodeDir, 'agents');
  const commandsPath = path.join(pluginOpencodeDir, 'commands');
  const scriptsPath  = path.join(pluginOpencodeDir, 'scripts');
  const contextPath  = path.join(pluginOpencodeDir, 'context', 'enterprise.yaml');
  const hasEnterpriseCtx = fs.existsSync(contextPath);
  const pluginRoot   = path.resolve(pluginFileDir, '..', '..');

  let syncResult = null;
  let projectRoot = null;

  // Helper para loggear (con try/catch para no romper el plugin)
  const log = async (level, message, extra = {}) => {
    const payload = { service: 'psw-devkit', level, message, ...extra };
    try {
      if (client && client.app && client.app.log) {
        await client.app.log({ body: payload });
      }
    } catch (e) {
      // Si el log falla, al menos lo mandamos a consola
      console.error(`[psw-devkit] ${level}: ${message}`, extra);
    }
  };

  // ===== RESOLVER PROJECT ROOT =====
  function resolveProjectRoot() {
    // PRIORIDAD 1: directory pasado por OpenCode
    if (directory) {
      const d = path.resolve(directory);
      log('info', `Usando directory de OpenCode: ${d}`);
      return d;
    }
    
    // PRIORIDAD 2: CWD
    const fromCwd = findProjectRoot(process.cwd());
    if (fromCwd) {
      log('info', `Project root desde CWD: ${fromCwd}`);
      return fromCwd;
    }
    
    // PRIORIDAD 3: desde el plugin hacia arriba buscando .git/package.json
    const fromPlugin = findProjectRoot(path.resolve(pluginFileDir, '..', '..', '..'));
    if (fromPlugin) {
      log('info', `Project root desde plugin: ${fromPlugin}`);
      return fromPlugin;
    }
    
    log('warn', 'No se encontró project root. Asegúrate de tener opencode.json, package.json o .git');
    return null;
  }

  return {
    
    /* ================================================================
       HOOK CONFIG
       ================================================================ */
    config: async (config) => {
      await log('info', '=== PSW DevKit v1.0.4 config hook ===', {
        plugin_file_dir: pluginFileDir,
        detected_opencode_dir: pluginOpencodeDir,
        directory_from_opencode: directory || null,
        cwd: process.cwd()
      });

      // ---- Verificar recursos fuente ----
      const sourceChecks = {
        skills_exists: fs.existsSync(skillsPath),
        agents_exists: fs.existsSync(agentsPath),
        commands_exists: fs.existsSync(commandsPath),
        scripts_exists: fs.existsSync(scriptsPath),
        context_exists: fs.existsSync(contextPath),
        skills_path: skillsPath,
        agents_path: agentsPath,
        commands_path: commandsPath
      };
      await log('info', 'Chequeo de fuentes', sourceChecks);

      // ---- 1. Skills (paths) ----
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      for (const cat of ['dotnet', 'methodology', 'rag', 'utils']) {
        const p = path.join(skillsPath, cat);
        if (fs.existsSync(p) && !config.skills.paths.includes(p)) {
          config.skills.paths.push(p);
          await log('info', `Skill path registrado: ${p}`);
        }
      }

      // ---- 2. Agents ----
      config.agent = config.agent || {};
      const agentFiles = loadMarkdownFiles(agentsPath);
      await log('info', `Archivos .md en agents/: ${agentFiles.length}`);
      
      if (agentFiles.length === 0) {
        await log('warn', 'No se encontraron agents .md. Verifica que la carpeta agents/ exista y tenga frontmatter con "name:"', {
          agentsPath,
          agents_exists: fs.existsSync(agentsPath)
        });
      }
      
      for (const { name, meta, body } of agentFiles) {
        if (!name) {
          await log('warn', 'Agent .md sin campo "name", ignorado');
          continue;
        }
        if (config.agent[name]) {
          await log('info', `Agent "${name}" ya existe en config, skipping`);
          continue;
        }
        
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
        await log('info', `Agent inyectado: ${name}`);
      }

      // ---- 3. Commands ----
      config.command = config.command || {};
      const commandFiles = loadMarkdownFiles(commandsPath);
      await log('info', `Archivos .md en commands/: ${commandFiles.length}`);
      
      if (commandFiles.length === 0) {
        await log('warn', 'No se encontraron commands .md. Verifica la carpeta commands/.', {
          commandsPath,
          commands_exists: fs.existsSync(commandsPath)
        });
      }
      
      for (const { name, meta, body } of commandFiles) {
        if (!name) {
          await log('warn', 'Command .md sin campo "name", ignorado');
          continue;
        }
        if (config.command[name]) {
          await log('info', `Command /${name} ya existe, skipping`);
          continue;
        }
        
        config.command[name] = {
          description: meta.description || `Command /${name}`,
          template: body.trim()
        };
        if (meta.agent) config.command[name].agent = meta.agent;
        if (meta.model) config.command[name].model = meta.model;
        if (meta.subtask) config.command[name].subtask = meta.subtask === 'true' || meta.subtask === true;
        await log('info', `Command inyectado: /${name}`);
      }

      // ---- 4. Metadatos ----
      config.psw_devkit = {
        scripts_path: scriptsPath,
        context_path: contextPath,
        version: '1.0.4-fixed',
        agents_injected: agentFiles.length,
        commands_injected: commandFiles.length,
        resources_dir: pluginOpencodeDir
      };

      // ---- 5. Sincronizar archivos al proyecto ----
      projectRoot = resolveProjectRoot();
      
      if (!projectRoot) {
        await log('error', 'No se pudo determinar project root. Sync omitido.', {
          hint: 'Crea un opencode.json, package.json o inicializa git en tu proyecto'
        });
        syncResult = { copied: [], skipped: [], errors: ['No project root found'] };
        return;
      }

      // Evitar sync sobre sí mismo (modo dev)
      if (path.resolve(projectRoot) === path.resolve(pluginRoot)) {
        await log('warn', 'Sync omitido: projectRoot === pluginRoot (desarrollo)');
        syncResult = { copied: [], skipped: [], errors: [], _skippedDev: true };
        return;
      }

      await log('info', `Iniciando sync a: ${path.join(projectRoot, '.opencode')}`);
      syncResult = doSync(projectRoot, pluginOpencodeDir);
      
      await log('info', 'Sync completado', {
        copied: syncResult.copied.length,
        skipped: syncResult.skipped.length,
        errors: syncResult.errors.length,
        copied_files: syncResult.copied.slice(0, 20),
        error_details: syncResult.errors
      });
    },

    /* ================================================================
       HOOK SESSION.CREATED
       ================================================================ */
    'session.created': async ({ client }) => {
      await log('info', 'PSW DevKit session.created', {
        enterprise_context_loaded: hasEnterpriseCtx,
        project_root: projectRoot,
        sync_copied: syncResult ? syncResult.copied.length : 'N/A',
        sync_errors: syncResult ? syncResult.errors.length : 'N/A'
      });
    },

    /* ================================================================
       Inyeccion de contexto empresarial
       ================================================================ */
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!hasEnterpriseCtx || !output.messages || !output.messages.length) return;

      const firstUser = output.messages.find(m => m.info && m.info.role === 'user');
      if (!firstUser || !firstUser.parts || !firstUser.parts.length) return;
      if (firstUser.parts.some(p => p.type === 'text' && p.text && p.text.includes('[PSW_DEVKIT_CONTEXT]'))) return;

      try {
        const ctx = fs.readFileSync(contextPath, 'utf8');
        const injection = `[PSW_DEVKIT_CONTEXT]\nEste es el contexto empresarial del equipo PSW. DEBES seguir estas reglas:\n\n${ctx}\n\n[FIN CONTEXT]\n\n`;
        
        // Crear nuevo array inmutable-friendly
        const ref = firstUser.parts[0];
        firstUser.parts = [{ ...ref, type: 'text', text: injection }, ...firstUser.parts];
      } catch (e) {
        await log('warn', 'Error inyectando contexto empresarial', { error: e.message });
      }
    }
  };
};
