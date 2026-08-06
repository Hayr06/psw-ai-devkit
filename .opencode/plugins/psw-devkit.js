/**
 * PSW DevKit Plugin para OpenCode.ai  (v2.1.0-memory)
 *
 * Estrategia: ZERO-COPY. Todo se carga en memoria desde el cache/git del plugin.
 * No se escribe NADA en el directorio del usuario.
 *
 * NOTA HONESTA: Los scripts .sh no pueden ejecutarse desde memoria (bash
 * necesita archivos físicos). Si se necesitan, se generan bajo demanda.
 *
 * ---------------------------------------------------------------------------
 * VERIFICADO CONTRA OpenCode 1.18.14 (sst/opencode @ v1.18.14)
 * ---------------------------------------------------------------------------
 * Cadena real de resolución de `temperature` (leída del código fuente):
 *
 *   1. session/llm/request.ts:124
 *        temperature = model.capabilities.temperature
 *          ? (agent.temperature ?? ProviderTransform.temperature(model))
 *          : undefined
 *      → si el modelo NO declara `"temperature": true` en el config del
 *        provider, la temperatura se descarta ENTERA (queda undefined).
 *
 *   2. session/llm/request.ts:90
 *        options = merge(ProviderTransform.options(...),
 *                        model.options, agent.options, variant)
 *      → OJO: `provider.<id>.options` NO entra aquí (solo se leen de ahí
 *        `setCacheKey` y `useCompletionUrls`). Pero `provider.<id>.models.
 *        <modelo>.options` SÍ entra completo.
 *
 *   3. session/llm.ts:313
 *        providerOptions = ProviderTransform.providerOptions(model, options)
 *      → queda como { "<providerID.split('.')[0]>": { ...options } }
 *
 *   4. @ai-sdk/openai-compatible@2.0.41, getArgs():
 *        args = { model, max_tokens, temperature, top_p, ...,
 *                 ...providerOptions[providerOptionsName] }   // ← SPREAD AL FINAL
 *      → cualquier `temperature` / `top_p` / `max_tokens` que venga en
 *        model.options PISA el valor top-level calculado en el paso 1.
 *
 *   ORDEN EFECTIVO (gana el último):
 *     model.options.temperature
 *       > agent.options.temperature
 *       > agent.temperature            ← lo que setea este plugin
 *       > ProviderTransform.temperature(model)   (qwen ⇒ 0.55)
 *
 *   Por eso NO basta con setear config.agent[x].temperature: si el usuario
 *   tiene `temperature` dentro de las options del modelo, TODOS los agentes
 *   corren con ese valor. El hook `chat.params` de abajo es el único punto
 *   donde se puede corregir sin tocar el config del usuario.
 *
 * Delegación vía Task (tool/task.ts, tool/registry.ts):
 *   - `subagent_type` es Schema.String, NO un enum. Los subagentes válidos se
 *     anuncian en la DESCRIPCIÓN de la tool (registry.ts describeTask), que
 *     filtra por `mode !== "primary"` y `permission.task` != deny.
 *   - task.ts:181 → `const model = next.model ?? { modelID/providerID del padre }`
 *     ⇒ el MODELO sí se hereda del padre si el subagente no declara uno.
 *   - La TEMPERATURA no se hereda: la sesión hija se promptea con
 *     `agent: next.name` y prompt.ts:1169 re-resuelve el Agent.Info por nombre,
 *     así que llega la temperatura propia del subagente.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Helpers puros. Viven en ../lib/ y no aquí porque OpenCode carga como plugin
// TODO archivo .js dentro de {plugin,plugins}/ y exige que todos los exports
// del módulo sean funciones (plugin/index.ts:105).
import { parseFrontmatter, toNumber, toBoolean } from '../lib/frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PLUGIN_VERSION = '2.1.0-memory';

/* ------------------------------------------------------------------ */
/*  Utilidades                                                        */
/* ------------------------------------------------------------------ */

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
            body: parsed.body,
            file: full
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

/**
 * Claves de sampling que, si aparecen en `options`, terminan spreadeadas
 * DESPUÉS de los parámetros top-level en @ai-sdk/openai-compatible y por
 * tanto los pisan. Ver cabecera del archivo.
 */
const SAMPLING_COLLISIONS = {
  temperature: ['temperature'],
  topP: ['top_p', 'topP'],
  maxOutputTokens: ['max_tokens', 'maxTokens']
};

/* ------------------------------------------------------------------ */
/*  Plugin principal                                                  */
/* ------------------------------------------------------------------ */

export const PSWDevKitPlugin = async ({ client, project, directory, $ }) => {

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

  // ===== ESTADO COMPARTIDO ENTRE HOOKS =====
  // Registro autoritativo de parámetros por agente, poblado en `config` y
  // consumido en `chat.params` (que es donde realmente se aplica).
  /** @type {Map<string, {name:string, mode:string, temperature?:number, topP?:number, model?:string, source:string}>} */
  const agentParams = new Map();

  // Trazas de delegación (task tool), para auditar la orquestación.
  const dispatches = [];
  const tracePath = process.env.PSW_DEVKIT_TRACE || null;

  // Helper de logging seguro. Escribe al log del server de OpenCode
  // (`opencode logs` / ~/.local/share/opencode/log) y, si eso falla, a stderr.
  const log = async (level, message, extra = undefined) => {
    try {
      if (client?.app?.log) {
        // El endpoint espera { service, level, message, extra } — `extra` es un
        // campo anidado, NO propiedades sueltas al nivel raíz.
        await client.app.log({
          body: {
            service: 'psw-devkit',
            level,
            message,
            ...(extra ? { extra } : {})
          }
        });
        return;
      }
    } catch (e) {
      // cae al console.error de abajo
    }
    const suffix = extra ? ` ${JSON.stringify(extra)}` : '';
    console.error(`[psw-devkit] ${level}: ${message}${suffix}`);
  };

  const trace = (entry) => {
    dispatches.push(entry);
    if (!tracePath) return;
    try {
      fs.appendFileSync(tracePath, JSON.stringify(entry) + '\n');
    } catch (e) {
      // el tracing es best-effort y opt-in; nunca debe romper una sesión
    }
  };

  return {

    /* ================================================================
       HOOK CONFIG  —  Todo se carga en memoria, ZERO disco
       ================================================================ */
    config: async (config) => {
      await log('info', `=== PSW DevKit v${PLUGIN_VERSION} ===`, {
        plugin_file_dir: pluginFileDir,
        detected_opencode_dir: pluginOpencodeDir,
        detected_repo_root: repoRoot,
        directory_from_opencode: directory || null,
        project_id: project?.id || null
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
      const skipped = [];

      for (const { name, meta, body, file } of agentFiles) {
        if (!name) continue;

        // Antes esto era un `continue` mudo: si otra fuente ya había definido
        // el agente, su temperatura/modo del frontmatter se perdían en silencio.
        if (config.agent[name]) {
          const existing = config.agent[name];
          skipped.push({
            agent: name,
            from_file: file,
            frontmatter_temperature: meta.temperature ?? null,
            frontmatter_mode: meta.mode ?? null,
            config_temperature: existing.temperature ?? null,
            config_mode: existing.mode ?? null
          });
          await log(
            'warn',
            `Agent "${name}" YA existe en config — se conserva la definición previa y se ` +
            `IGNORA el frontmatter de ${file}. ` +
            `temperature: config=${existing.temperature ?? '(sin definir)'} ` +
            `vs frontmatter=${meta.temperature ?? '(sin definir)'}`,
            { agent: name, file }
          );
          // Aun así lo registramos para chat.params, usando el valor que
          // efectivamente quedó en config (no el del frontmatter).
          agentParams.set(name, {
            name,
            mode: existing.mode || 'subagent',
            temperature: toNumber(existing.temperature),
            topP: toNumber(existing.top_p),
            model: existing.model,
            source: 'config-preexistente'
          });
          continue;
        }

        const temperature = toNumber(meta.temperature);
        const topP = toNumber(meta.top_p);

        // Diagnóstico: valor presente pero no parseable (p.ej. `temperature: alta`)
        if (meta.temperature !== undefined && temperature === undefined) {
          await log('warn', `Agent "${name}": temperature="${meta.temperature}" no es numérico, se ignora`, {
            agent: name, file
          });
        }

        config.agent[name] = {
          description: meta.description || `Agent ${name}`,
          mode: meta.mode || 'subagent',
          prompt: body.trim()
        };
        if (meta.model) config.agent[name].model = meta.model;
        // `!== undefined` en vez de truthy: preserva `temperature: 0`.
        if (temperature !== undefined) config.agent[name].temperature = temperature;
        if (topP !== undefined) config.agent[name].top_p = topP;
        if (meta.permission && typeof meta.permission === 'object') {
          config.agent[name].permission = meta.permission;
        }
        if (meta.steps !== undefined) {
          const steps = toNumber(meta.steps);
          if (steps !== undefined) config.agent[name].steps = steps;
        }
        if (meta.hidden !== undefined) {
          const hidden = toBoolean(meta.hidden);
          if (hidden !== undefined) config.agent[name].hidden = hidden;
        }

        agentParams.set(name, {
          name,
          mode: config.agent[name].mode,
          temperature,
          topP,
          model: meta.model,
          source: 'frontmatter'
        });
        agentsInjected++;
      }

      await log('info', `Agents inyectados en memoria: ${agentsInjected} (omitidos: ${skipped.length})`);

      // ---- 2b. Permisos de delegación para los agentes primary ----
      // registry.ts describeTask() sólo anuncia en la tool `task` los agentes
      // con mode != "primary" cuyo permiso `task` no esté en "deny" para el
      // agente que la invoca. Hacemos explícito el allow-list.
      const subagents = [...agentParams.values()]
        .filter((a) => a.mode === 'subagent' || a.mode === 'all')
        .map((a) => a.name)
        .sort();

      for (const spec of agentParams.values()) {
        if (spec.mode !== 'primary') continue;
        const entry = config.agent[spec.name];
        if (!entry) continue;
        entry.permission = entry.permission || {};
        if (entry.permission.task === undefined) {
          // Sólo allows explícitos; no añadimos un "*": "deny" para no
          // ocultar los subagentes nativos (general, explore...).
          entry.permission.task = Object.fromEntries(subagents.map((n) => [n, 'allow']));
          await log('info', `permission.task inyectado para "${spec.name}"`, {
            agent: spec.name,
            allowed_subagents: subagents
          });
        }
      }

      // ---- 2c. Detección de colisiones de sampling en el config del provider ----
      // Ver cabecera: lo que esté en provider.<id>.models.<m>.options termina
      // spreadeado DESPUÉS de los params top-level y los pisa.
      const collisions = [];
      for (const [providerID, prov] of Object.entries(config.provider || {})) {
        for (const key of ['temperature', 'top_p', 'topP']) {
          if (prov?.options && prov.options[key] !== undefined) {
            // Informativo: provider.options NO entra en la request en 1.18.14
            // (request.ts sólo lee setCacheKey/useCompletionUrls de ahí).
            collisions.push({
              scope: `provider.${providerID}.options.${key}`,
              value: prov.options[key],
              effect: 'sin efecto en 1.18.14 (no se propaga a la request)'
            });
          }
        }
        for (const [modelID, model] of Object.entries(prov?.models || {})) {
          if (model?.temperature === undefined) {
            collisions.push({
              scope: `provider.${providerID}.models["${modelID}"].temperature`,
              value: '(sin declarar)',
              effect:
                'capabilities.temperature=false ⇒ OpenCode NO envía temperature para ' +
                'este modelo y la de los agentes se descarta. Añade "temperature": true.'
            });
          }
          for (const key of ['temperature', 'top_p', 'topP', 'max_tokens']) {
            if (model?.options && model.options[key] !== undefined) {
              collisions.push({
                scope: `provider.${providerID}.models["${modelID}"].options.${key}`,
                value: model.options[key],
                effect: 'PISA el parámetro por agente (spread al final del body)'
              });
            }
          }
        }
      }
      if (collisions.length) {
        await log(
          'warn',
          `Colisiones de sampling detectadas en el config (${collisions.length}). ` +
          `El hook chat.params las neutraliza para los agentes del devkit.`,
          { collisions }
        );
      }

      // ---- 3. Commands en memoria ----
      config.command = config.command || {};
      const commandFiles = loadMarkdownFiles(commandsPath);
      let commandsInjected = 0;
      let commandsSkipped = 0;

      for (const { name, meta, body, file } of commandFiles) {
        if (!name) continue;
        if (config.command[name]) {
          commandsSkipped++;
          await log('warn', `Command "/${name}" ya existe en config — se ignora ${file}`, {
            command: name, file
          });
          continue;
        }

        config.command[name] = {
          description: meta.description || `Command /${name}`,
          template: body.trim()
        };
        if (meta.agent) config.command[name].agent = meta.agent;
        if (meta.model) config.command[name].model = meta.model;
        if (meta.subtask !== undefined) {
          const subtask = toBoolean(meta.subtask);
          if (subtask !== undefined) config.command[name].subtask = subtask;
        }
        commandsInjected++;
      }
      await log('info', `Commands inyectados en memoria: ${commandsInjected} (omitidos: ${commandsSkipped})`);

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
        version: PLUGIN_VERSION,
        resources_dir: pluginOpencodeDir,
        repo_root: repoRoot,
        agents_injected: agentsInjected,
        agents_skipped: skipped,
        commands_injected: commandsInjected,
        skills_paths: skillsRegistered,
        enterprise_context_loaded: hasEnterpriseCtx,
        sampling_collisions: collisions,
        scaffolding: scaffoldingMemory,      // ← TODO en memoria
        docs: docsMemory,                    // ← TODO en memoria
        scripts: scriptsMemory,              // ← En memoria (solo referencia)
        scripts_path: scriptsPath,           // ← Ruta física por si se necesita
        context_path: contextPath            // ← Ruta física del enterprise.yaml
      };

      // ---- 8. OBSERVABILIDAD: tabla de temperaturas efectivas ----
      // "Efectiva" = lo que este plugin va a forzar en chat.params, que es el
      // último eslabón antes de que OpenCode arme el body de la request.
      const table = [...agentParams.values()]
        .sort((a, b) => (a.mode === b.mode ? a.name.localeCompare(b.name) : a.mode === 'primary' ? -1 : 1))
        .map((a) => ({
          agent: a.name,
          mode: a.mode,
          temperature: a.temperature !== undefined ? a.temperature : '(default del modelo)',
          top_p: a.topP !== undefined ? a.topP : '(default del modelo)',
          model: a.model || '(hereda del padre / default)',
          source: a.source,
          enforced_by_plugin: a.temperature !== undefined
        }));

      await log('info', '=== TEMPERATURAS EFECTIVAS POR AGENTE ===', { agents: table });
      for (const row of table) {
        await log(
          'info',
          `  [${row.mode.padEnd(8)}] ${row.agent.padEnd(24)} temp=${String(row.temperature).padEnd(22)} ` +
          `top_p=${String(row.top_p).padEnd(22)} enforced=${row.enforced_by_plugin}`
        );
      }

      await log('info', 'PSW DevKit cargado completamente en memoria', {
        total_agents: agentsInjected,
        total_commands: commandsInjected,
        scaffolding_templates: Object.keys(scaffoldingMemory).length > 0 ? 'disponibles' : 'no encontrados',
        docs_available: Object.keys(docsMemory).length > 0 ? 'disponibles' : 'no encontrados'
      });
    },

    /* ================================================================
       HOOK CHAT.PARAMS  —  Aplicación REAL de la temperatura por agente
       ----------------------------------------------------------------
       Este hook corre en session/llm/request.ts justo después de calcular
       `temperature/topP/options` y justo antes de que llm.ts se los pase a
       streamText(). Es el ÚLTIMO punto en el que se pueden corregir sin
       tocar el opencode.json del usuario (zero-disco).

       Dos cosas hay que hacer aquí, no una:
         (a) fijar output.temperature al valor del agente
         (b) BORRAR output.options.temperature — si no, ese valor se spreadea
             después en el body del provider y pisa (a).
       ================================================================ */
    'chat.params': async (input, output) => {
      const spec = agentParams.get(input.agent);
      const opts = output.options || {};

      const before = {
        temperature: output.temperature,
        topP: output.topP,
        options_temperature: opts.temperature,
        options_top_p: opts.top_p ?? opts.topP
      };

      // Aviso si el modelo no declara soporte de temperature: en ese caso
      // OpenCode manda `undefined` y ningún ajuste por agente tiene efecto.
      if (input.model?.capabilities && input.model.capabilities.temperature === false) {
        await log(
          'warn',
          `Modelo "${input.model.id}" tiene capabilities.temperature=false: OpenCode descarta la ` +
          `temperatura. Añade "temperature": true al modelo en el config del provider.`,
          { agent: input.agent, model: input.model.id }
        );
      }

      const applied = [];

      if (spec && spec.temperature !== undefined) {
        output.temperature = spec.temperature;
        for (const key of SAMPLING_COLLISIONS.temperature) {
          if (opts[key] !== undefined) {
            applied.push(`options.${key}=${opts[key]} eliminado (pisaba la del agente)`);
            delete opts[key];
          }
        }
        applied.push(`temperature=${spec.temperature}`);
      } else if (opts.temperature !== undefined) {
        // El agente no declara temperatura: respetamos la del usuario pero la
        // hacemos visible, porque es la que realmente se va a usar.
        applied.push(`temperature=${opts.temperature} (de options del modelo, agente sin temperatura propia)`);
      }

      if (spec && spec.topP !== undefined) {
        output.topP = spec.topP;
        for (const key of SAMPLING_COLLISIONS.topP) {
          if (opts[key] !== undefined) {
            applied.push(`options.${key}=${opts[key]} eliminado`);
            delete opts[key];
          }
        }
        applied.push(`top_p=${spec.topP}`);
      }

      output.options = opts;

      const effective = {
        temperature: opts.temperature !== undefined ? opts.temperature : output.temperature,
        top_p: (opts.top_p ?? opts.topP) !== undefined ? (opts.top_p ?? opts.topP) : output.topP
      };

      await log('info', `chat.params · agent=${input.agent} · temp efectiva=${effective.temperature}`, {
        session: input.sessionID,
        agent: input.agent,
        model: input.model?.id,
        known_agent: Boolean(spec),
        declared_temperature: spec?.temperature ?? null,
        before,
        applied,
        effective
      });

      trace({
        kind: 'chat.params',
        sessionID: input.sessionID,
        agent: input.agent,
        model: input.model?.id,
        declared_temperature: spec?.temperature ?? null,
        effective_temperature: effective.temperature,
        effective_top_p: effective.top_p
      });
    },

    /* ================================================================
       INSTRUMENTACIÓN DE DELEGACIÓN  (task tool)
       ----------------------------------------------------------------
       Registra cada llamada a la tool `task`: qué subagente, con qué args
       y con qué temperatura le corresponde. Es a la vez observabilidad y
       el instrumento de prueba de la orquestación.
       ================================================================ */
    'tool.execute.before': async (input, output) => {
      if (input.tool !== 'task') return;
      const args = output.args || {};
      const target = args.subagent_type;
      const spec = agentParams.get(target);

      const entry = {
        kind: 'task.dispatch',
        phase: 'before',
        sessionID: input.sessionID,
        callID: input.callID,
        subagent_type: target,
        known_agent: Boolean(spec),
        subagent_mode: spec?.mode ?? null,
        expected_temperature: spec?.temperature ?? null,
        description: args.description,
        background: args.background === true,
        prompt_preview: typeof args.prompt === 'string' ? args.prompt.slice(0, 200) : undefined
      };
      trace(entry);

      if (!spec) {
        await log(
          'warn',
          `DELEGACIÓN → subagent_type="${target}" NO es un agente del devkit ` +
          `(puede ser nativo: general/explore, o un nombre inventado por el modelo)`,
          entry
        );
        return;
      }

      await log(
        'info',
        `DELEGACIÓN → ${target} (mode=${spec.mode}, temp=${spec.temperature ?? 'default'}) :: ${args.description || ''}`,
        entry
      );
    },

    'tool.execute.after': async (input, output) => {
      if (input.tool !== 'task') return;
      const target = input.args?.subagent_type;
      const spec = agentParams.get(target);
      const meta = output.metadata || {};

      const entry = {
        kind: 'task.dispatch',
        phase: 'after',
        sessionID: input.sessionID,
        callID: input.callID,
        subagent_type: target,
        expected_temperature: spec?.temperature ?? null,
        // task.ts:181 → si el subagente no declara `model`, hereda el del padre.
        resolved_model: meta.model ? `${meta.model.providerID}/${meta.model.modelID}` : null,
        child_session: meta.sessionId ?? null,
        parent_session: meta.parentSessionId ?? null,
        output_chars: typeof output.output === 'string' ? output.output.length : 0
      };
      trace(entry);

      await log(
        'info',
        `DELEGACIÓN ✓ ${target} · modelo resuelto=${entry.resolved_model} · ` +
        `temp esperada=${entry.expected_temperature ?? 'default'} · sesión hija=${entry.child_session}`,
        entry
      );
    },

    /* ================================================================
       EVENTOS DE SESIÓN
       ----------------------------------------------------------------
       NOTA: en la API de plugin de OpenCode 1.18.14 no existe un hook
       "session.created". Los eventos llegan todos por el hook `event`
       (plugin/index.ts:253). El hook anterior era código muerto.
       ================================================================ */
    event: async ({ event }) => {
      if (event?.type !== 'session.updated') return;
      const session = event.properties?.info;
      if (!session || session.parentID) return;      // sólo sesiones raíz
      if (session.time?.created !== session.time?.updated) return;  // sólo al crearse

      await log('info', `PSW DevKit v${PLUGIN_VERSION} sesión activa`, {
        session: session.id,
        enterprise_context_loaded: hasEnterpriseCtx,
        mode: 'zero-copy (todo en memoria)',
        agents_registrados: agentParams.size,
        trace_file: tracePath
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

// IMPORTANTE: no añadir más exports a este archivo. OpenCode recorre TODOS los
// exports del módulo de plugin y lanza "Plugin export is not a function" si
// alguno no lo es (plugin/index.ts:105). Los helpers testeables van en ../lib/.
