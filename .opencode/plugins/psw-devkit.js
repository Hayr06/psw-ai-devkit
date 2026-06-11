/**
 * PSW DevKit Plugin para OpenCode.ai  (v2.0.0-memory)
 *
 * Estrategia: ZERO-COPY. Todo se carga en memoria desde el cache/git del plugin.
 * No se escribe NADA en el directorio del usuario.
 *
 * NOTA HONESTA: Los scripts .sh no pueden ejecutarse desde memoria (bash
 * necesita archivos físicos). Si se necesitan, se generan bajo demanda.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ */
/*  Utilidades                                                        */
/* ------------------------------------------------------------------ */

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

/** Carga TODO el contenido de un directorio en un objeto { "ruta/relativa": "contenido" } */
function loadDirectoryAsMemory(dir, basePath = dir) {
  const memory = {};
  if (!fs.existsSync(dir)) return memory;

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir)) {
      const full = path.join(currentDir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        const relPath = path.relative(basePath, full);
        try {
          memory[relPath] = fs.readFileSync(full, 'utf8');
        } catch (e) {
          // Skip archivos binarios o ilegibles
        }
      }
    }
  }
  walk(dir);
  return memory;
}

/* ------------------------------------------------------------------ */
/*  Plugin principal                                                  */
/* ------------------------------------------------------------------ */

export const PSWDevKitPlugin = async ({ client, directory }) => {
  
  // ===== DETECCIÓN DE ESTRUCTURA =====
  // El .js puede estar en: .opencode/plugins/ (hermano de agents/) 
  // o en un cache temporal de OpenCode.
  
  const pluginFileDir = __dirname;
  
  // Opción A: estructura repo estándar (.opencode/plugins/ este archivo)
  const siblingOpencodeDir = path.resolve(pluginFileDir, '..');
  
  // Opción B: cache de git donde todo está más arriba
  const grandparentOpencodeDir = path.resolve(pluginFileDir, '..', '..');
  
  // Opción C: raíz del repo (para scaffolding/ y docs/)
  const repoRootSibling = path.resolve(pluginFileDir, '..', '..');
  const repoRootGrandparent = path.resolve(pluginFileDir, '..', '..', '..');
  
  let pluginOpencodeDir = null;
  let repoRoot = null;
  
  // Detectar dónde están los recursos principales
  for (const cand of [
    { dir: siblingOpencodeDir, name: 'sibling' },
    { dir: grandparentOpencodeDir, name: 'grandparent' }
  ]) {
    const hasAgents = fs.existsSync(path.join(cand.dir, 'agents'));
    const hasCommands = fs.existsSync(path.join(cand.dir, 'commands'));
    if (hasAgents || hasCommands) {
      pluginOpencodeDir = cand.dir;
      break;
    }
  }
  if (!pluginOpencodeDir) pluginOpencodeDir = siblingOpencodeDir;
  
  // Detectar raíz del repo (para scaffolding y docs)
  for (const cand of [
    { dir: repoRootSibling, name: 'repo-sibling' },
    { dir: repoRootGrandparent, name: 'repo-grandparent' }
  ]) {
    const hasScaffolding = fs.existsSync(path.join(cand.dir, 'scaffolding'));
    const hasDocs = fs.existsSync(path.join(cand.dir, 'docs'));
    if (hasScaffolding || hasDocs) {
      repoRoot = cand.dir;
      break;
    }
  }
  if (!repoRoot) repoRoot = path.resolve(pluginOpencodeDir, '..');

  // Paths principales
  const skillsPath   = path.join(pluginOpencodeDir, 'skills');
  const agentsPath   = path.join(pluginOpencodeDir, 'agents');
  const commandsPath = path.join(pluginOpencodeDir, 'commands');
  const scriptsPath  = path.join(pluginOpencodeDir, 'scripts');
  const contextPath  = path.join(pluginOpencodeDir, 'context', 'enterprise.yaml');
  const hasEnterpriseCtx = fs.existsSync(contextPath);
  
  // Paths de recursos adicionales
  const scaffoldingPath = path.join(repoRoot, 'scaffolding');
  const docsPath      = path.join(repoRoot, 'docs');

  // Helper de logging seguro
  const log = async (level, message, extra = {}) => {
    const payload = { service: 'psw-devkit', level, message, ...extra };
    try {
      if (client?.app?.log) await client.app.log({ body: payload });
    } catch (e) {
      console.error(`[psw-devkit] ${level}: ${message}`, extra);
    }
  };

  return {
    
    /* ================================================================
       HOOK CONFIG  —  Todo se carga en memoria, ZERO disco
       ================================================================ */
    config: async (config) => {
      await log('info', '=== PSW DevKit v2.0.0-memory ===', {
        plugin_file_dir: pluginFileDir,
        detected_opencode_dir: pluginOpencodeDir,
        detected_repo_root: repoRoot,
        directory_from_opencode: directory || null
      });

      // ---- 1. Skills (paths absolutos al cache de git) ----
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      let skillsRegistered = 0;
      for (const cat of ['dotnet', 'methodology', 'rag', 'utils']) {
        const p = path.join(skillsPath, cat);
        if (fs.existsSync(p) && !config.skills.paths.includes(p)) {
          config.skills.paths.push(p);
          skillsRegistered++;
        }
      }
      await log('info', `Skills paths registrados: ${skillsRegistered}`);

      // ---- 2. Agents en memoria ----
      config.agent = config.agent || {};
      const agentFiles = loadMarkdownFiles(agentsPath);
      let agentsInjected = 0;
      
      for (const { name, meta, body } of agentFiles) {
        if (!name || config.agent[name]) continue;
        
        config.agent[name] = {
          description: meta.description || `Agent ${name}`,
          mode: meta.mode || 'subagent',
          prompt: body.trim()
        };
        if (meta.model) config.agent[name].model = meta.model;
        if (meta.temperature) config.agent[name].temperature = parseFloat(meta.temperature);
        if (meta.permission) config.agent[name].permission = meta.permission;
        agentsInjected++;
      }
      await log('info', `Agents inyectados en memoria: ${agentsInjected}`);

      // ---- 3. Commands en memoria ----
      config.command = config.command || {};
      const commandFiles = loadMarkdownFiles(commandsPath);
      let commandsInjected = 0;
      
      for (const { name, meta, body } of commandFiles) {
        if (!name || config.command[name]) continue;
        
        config.command[name] = {
          description: meta.description || `Command /${name}`,
          template: body.trim()
        };
        if (meta.agent) config.command[name].agent = meta.agent;
        if (meta.model) config.command[name].model = meta.model;
        if (meta.subtask) config.command[name].subtask = meta.subtask === 'true' || meta.subtask === true;
        commandsInjected++;
      }
      await log('info', `Commands inyectados en memoria: ${commandsInjected}`);

      // ---- 4. Scaffolding en memoria ----
      // Cargamos TODO el contenido de los templates para que agents/commands
      // puedan usarlo sin tocar el disco del usuario.
      let scaffoldingMemory = {};
      if (fs.existsSync(scaffoldingPath)) {
        scaffoldingMemory = loadDirectoryAsMemory(scaffoldingPath);
        await log('info', `Scaffolding cargado en memoria: ${Object.keys(scaffoldingMemory).length} archivos`);
      } else {
        await log('warn', 'Carpeta scaffolding/ no encontrada en repo');
      }

      // ---- 5. Docs en memoria ----
      let docsMemory = {};
      if (fs.existsSync(docsPath)) {
        docsMemory = loadDirectoryAsMemory(docsPath);
        await log('info', `Docs cargados en memoria: ${Object.keys(docsMemory).length} archivos`);
      } else {
        await log('warn', 'Carpeta docs/ no encontrada en repo');
      }

      // ---- 6. Scripts en memoria (solo lectura, no ejecución) ----
      // NOTA HONESTA: Los .sh no pueden ejecutarse desde memoria. Los cargamos
      // como texto para referencia, pero bash necesita archivos físicos.
      let scriptsMemory = {};
      if (fs.existsSync(scriptsPath)) {
        scriptsMemory = loadDirectoryAsMemory(scriptsPath);
        await log('info', `Scripts cargados en memoria (referencia): ${Object.keys(scriptsMemory).length} archivos`);
        await log('warn', 'Scripts .sh requieren archivo físico para ejecutarse con bash. Se cargan solo como referencia.');
      }

      // ---- 7. Metadatos consolidados ----
      config.psw_devkit = {
        version: '2.0.0-memory',
        resources_dir: pluginOpencodeDir,
        repo_root: repoRoot,
        agents_injected: agentsInjected,
        commands_injected: commandsInjected,
        skills_paths: skillsRegistered,
        enterprise_context_loaded: hasEnterpriseCtx,
        scaffolding: scaffoldingMemory,      // ← TODO en memoria
        docs: docsMemory,                    // ← TODO en memoria
        scripts: scriptsMemory,              // ← En memoria (solo referencia)
        scripts_path: scriptsPath,           // ← Ruta física por si se necesita
        context_path: contextPath            // ← Ruta física del enterprise.yaml
      };

      await log('info', 'PSW DevKit cargado completamente en memoria', {
        total_agents: agentsInjected,
        total_commands: commandsInjected,
        scaffolding_templates: Object.keys(scaffoldingMemory).length > 0 ? 'disponibles' : 'no encontrados',
        docs_available: Object.keys(docsMemory).length > 0 ? 'disponibles' : 'no encontrados'
      });
    },

    /* ================================================================
       HOOK SESSION.CREATED
       ================================================================ */
    'session.created': async ({ client }) => {
      await log('info', 'PSW DevKit v2.0.0 session activa', {
        enterprise_context_loaded: hasEnterpriseCtx,
        mode: 'zero-copy (todo en memoria)'
      });
    },

    /* ================================================================
       Inyección de contexto empresarial
       ================================================================ */
    'experimental.chat.messages.transform': async (_input, output) => {
      if (!hasEnterpriseCtx || !output.messages || !output.messages.length) return;

      const firstUser = output.messages.find(m => m.info && m.info.role === 'user');
      if (!firstUser || !firstUser.parts || !firstUser.parts.length) return;
      if (firstUser.parts.some(p => p.type === 'text' && p.text && p.text.includes('[PSW_DEVKIT_CONTEXT]'))) return;

      try {
        const ctx = fs.readFileSync(contextPath, 'utf8');
        const injection = `[PSW_DEVKIT_CONTEXT]\nEste es el contexto empresarial del equipo PSW. DEBES seguir estas reglas:\n\n${ctx}\n\n[FIN CONTEXT]\n\n`;
        
        const ref = firstUser.parts[0];
        firstUser.parts = [{ ...ref, type: 'text', text: injection }, ...firstUser.parts];
      } catch (e) {
        await log('warn', 'Error inyectando contexto empresarial', { error: e.message });
      }
    }
  };
};
