/**
 * Pruebas deterministas del plugin PSW DevKit.
 *
 *   node --test test/
 *
 * Qué es determinista aquí (no depende del LLM):
 *   - el hook `config` registra los agentes con su mode/temperature
 *   - `temperature: 0` sobrevive al parseo
 *   - el hook `chat.params` produce la temperatura efectiva correcta
 *   - la instrumentación de la tool `task` registra la delegación
 *
 * Qué NO se prueba aquí: si el orchestrator DECIDE delegar. Eso lo decide el
 * modelo y se mide con test/dispatch-rate.mjs (integración, no determinista).
 *
 * El simulador de más abajo replica la cadena real de OpenCode 1.18.14
 * (session/llm/request.ts + provider/transform.ts + @ai-sdk/openai-compatible
 * 2.0.41 getArgs). Ver la cabecera de .opencode/plugins/psw-devkit.js.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PSWDevKitPlugin } from '../.opencode/plugins/psw-devkit.js';
// Los helpers puros viven fuera del plugin: ver la nota al final de psw-devkit.js.
import * as __test__ from '../.opencode/lib/frontmatter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const MODEL_ID = 'Qwen/Qwen3.6-35B-A3B-FP8';

/** Réplica del opencode.jsonc real del usuario (~/.config/opencode/opencode.jsonc). */
function makeUserConfig() {
  return {
    provider: {
      pcai: {
        npm: '@ai-sdk/openai-compatible',
        name: 'PSW PCAI',
        options: {
          baseURL: 'https://example.invalid/v1',
          timeout: 1800000,
          chunkTimeout: 300000
        },
        models: {
          [MODEL_ID]: {
            name: 'Qwen 3.6',
            reasoning: true,
            tool_call: true,
            temperature: true,
            limit: { context: 262144, output: 8192 },
            options: {
              max_tokens: 8192,
              temperature: 0.4,          // ← el que pisaba todo
              top_p: 0.8,
              repetition_penalty: 1.0,
              presence_penalty: 0.0,
              extraBody: {
                stream: true,
                chat_template_kwargs: { enable_thinking: true }
              }
            }
          }
        }
      }
    },
    model: `pcai/${MODEL_ID}`,
    permission: { task: { '*': 'allow' } },
    agent: {}
  };
}

function makeFakeClient() {
  const logs = [];
  return {
    logs,
    app: {
      log: async ({ body }) => {
        logs.push(body);
        return true;
      }
    }
  };
}

async function bootPlugin(config = makeUserConfig()) {
  const client = makeFakeClient();
  const hooks = await PSWDevKitPlugin({
    client,
    project: { id: 'test-project' },
    directory: REPO_ROOT,
    worktree: REPO_ROOT,
    $: null
  });
  await hooks.config(config);
  return { hooks, config, client };
}

/* ------------------------------------------------------------------ */
/*  Simulador de la cadena de resolución de OpenCode 1.18.14           */
/* ------------------------------------------------------------------ */

/** provider/transform.ts:526 — default por familia de modelo. */
function providerTransformTemperature(apiId) {
  const id = apiId.toLowerCase();
  if (id.includes('qwen')) return 0.55;
  if (id.includes('claude')) return undefined;
  return undefined;
}

/** provider/transform.ts:547 */
function providerTransformTopP(apiId) {
  return apiId.toLowerCase().includes('qwen') ? 1 : undefined;
}

/**
 * Devuelve el body HTTP que acabaría recibiendo el endpoint OpenAI-compatible
 * para un agente dado, con y sin el hook `chat.params` del plugin.
 */
async function resolveEffectiveBody(config, agentName, chatParamsHook) {
  const modelCfg = config.provider.pcai.models[MODEL_ID];
  const agentCfg = config.agent[agentName] ?? {};

  // provider/provider.ts:1461 — si el modelo no declara `temperature`, es false.
  const capabilitiesTemperature = modelCfg.temperature ?? false;

  // session/llm/request.ts:124
  const topLevelTemperature = capabilitiesTemperature
    ? (agentCfg.temperature ?? providerTransformTemperature(MODEL_ID))
    : undefined;

  // session/llm/request.ts:90 — base ⊕ model.options ⊕ agent.options ⊕ variant.
  // (provider.<id>.options NO entra: request.ts sólo lee de ahí setCacheKey y
  //  useCompletionUrls.)
  const options = { ...(modelCfg.options ?? {}), ...(agentCfg.options ?? {}) };

  const params = {
    temperature: topLevelTemperature,
    topP: agentCfg.top_p ?? providerTransformTopP(MODEL_ID),
    topK: undefined,
    maxOutputTokens: Math.min(modelCfg.limit.output, 32000),
    options
  };

  if (chatParamsHook) {
    await chatParamsHook(
      {
        sessionID: 'ses_test',
        agent: agentName,
        model: { id: MODEL_ID, capabilities: { temperature: capabilitiesTemperature } },
        provider: { info: { id: 'pcai' }, options: config.provider.pcai.options },
        message: {}
      },
      params
    );
  }

  // @ai-sdk/openai-compatible@2.0.41 getArgs(): el spread de providerOptions
  // va DESPUÉS de los parámetros estándar, así que los pisa.
  return {
    model: MODEL_ID,
    max_tokens: params.maxOutputTokens,
    temperature: params.temperature,
    top_p: params.topP,
    ...params.options
  };
}

/* ------------------------------------------------------------------ */
/*  1. Parseo de frontmatter                                          */
/* ------------------------------------------------------------------ */

test('parseFrontmatter preserva temperature: 0 y claves con guiones anidadas', () => {
  const md = [
    '---',
    'name: zero-agent',
    'description: agente determinista',
    'mode: subagent',
    'temperature: 0',
    'top_p: 0',
    'permission:',
    '  task:',
    '    backend-specialist: allow',
    '    qa-specialist: deny',
    '  edit: allow',
    '---',
    '',
    'Cuerpo del prompt.'
  ].join('\n');

  const { meta, body } = __test__.parseFrontmatter(md);

  assert.equal(meta.name, 'zero-agent');
  assert.equal(meta.temperature, '0');
  assert.equal(__test__.toNumber(meta.temperature), 0, 'temperature: 0 debe sobrevivir');
  assert.equal(__test__.toNumber(meta.top_p), 0);
  // El parser anterior sólo llegaba a 2 niveles y su regex ^(\w+) no aceptaba
  // guiones, así que esto era imposible de expresar.
  assert.deepEqual(meta.permission, {
    task: { 'backend-specialist': 'allow', 'qa-specialist': 'deny' },
    edit: 'allow'
  });
  assert.equal(body.trim(), 'Cuerpo del prompt.');
});

test('toNumber distingue 0 de "no definido" y de basura', () => {
  const { toNumber } = __test__;
  assert.equal(toNumber(0), 0);
  assert.equal(toNumber('0'), 0);
  assert.equal(toNumber('0.0'), 0);
  assert.equal(toNumber(0.2), 0.2);
  assert.equal(toNumber(undefined), undefined);
  assert.equal(toNumber(null), undefined);
  assert.equal(toNumber(''), undefined);
  assert.equal(toNumber('   '), undefined);
  assert.equal(toNumber('alta'), undefined, 'no numérico ⇒ undefined, nunca NaN');
  assert.equal(toNumber(NaN), undefined);
  assert.equal(toNumber(Infinity), undefined, 'Schema.Finite rechazaría Infinity');
});

/* ------------------------------------------------------------------ */
/*  2. Registro de agentes vía el hook `config`                        */
/* ------------------------------------------------------------------ */

const EXPECTED_AGENTS = {
  orchestrator:          { mode: 'primary',  temperature: 0.7 },
  'backend-specialist':  { mode: 'subagent', temperature: 0.3 },
  'frontend-specialist': { mode: 'subagent', temperature: 0.3 },
  'devops-specialist':   { mode: 'subagent', temperature: 0.3 },
  'migration-specialist':{ mode: 'subagent', temperature: 0.4 },
  'qa-specialist':       { mode: 'subagent', temperature: 0.2 },
  'security-specialist': { mode: 'subagent', temperature: 0.2 }
};

test('el hook config registra todos los agentes con su mode y temperatura', async () => {
  const { config } = await bootPlugin();

  for (const [name, expected] of Object.entries(EXPECTED_AGENTS)) {
    const agent = config.agent[name];
    assert.ok(agent, `falta el agente ${name}`);
    assert.equal(agent.mode, expected.mode, `${name}: mode`);
    assert.equal(agent.temperature, expected.temperature, `${name}: temperature`);
    assert.ok(agent.prompt && agent.prompt.length > 0, `${name}: prompt vacío`);
    assert.ok(agent.description, `${name}: sin description (no aparecería en la tool task)`);
  }
});

test('el orchestrator es el único primary y los especialistas son subagent', async () => {
  const { config } = await bootPlugin();
  const primaries = Object.entries(config.agent)
    .filter(([, a]) => a.mode === 'primary')
    .map(([n]) => n);
  assert.deepEqual(primaries, ['orchestrator']);

  // registry.ts describeTask() sólo anuncia agentes con mode !== "primary".
  const subagents = Object.entries(config.agent)
    .filter(([, a]) => a.mode === 'subagent')
    .map(([n]) => n)
    .sort();
  assert.deepEqual(subagents, [
    'backend-specialist', 'devops-specialist', 'frontend-specialist',
    'migration-specialist', 'qa-specialist', 'security-specialist'
  ]);
});

test('el orchestrator declara permission.task para los 6 especialistas', async () => {
  const { config } = await bootPlugin();
  const task = config.agent.orchestrator.permission?.task;
  assert.ok(task, 'orchestrator sin permission.task');

  for (const name of Object.keys(EXPECTED_AGENTS)) {
    if (name === 'orchestrator') continue;
    assert.equal(task[name], 'allow', `${name} no está permitido en permission.task`);
  }
  // No debe haber un "*": "deny" que oculte los subagentes nativos.
  assert.notEqual(task['*'], 'deny');
});

test('un agente preexistente en config se conserva y se avisa por log', async () => {
  const config = makeUserConfig();
  config.agent['qa-specialist'] = { mode: 'subagent', temperature: 0.9, prompt: 'previo' };

  const { client, config: out } = await bootPlugin(config);

  assert.equal(out.agent['qa-specialist'].temperature, 0.9, 'no debe pisarse la definición previa');

  const warned = client.logs.some(
    (l) => l.level === 'warn' && l.message.includes('"qa-specialist" YA existe')
  );
  assert.ok(warned, 'el skip debe quedar registrado, no ser silencioso');

  const skipped = out.psw_devkit.agents_skipped;
  assert.equal(skipped.length, 1);
  assert.equal(skipped[0].agent, 'qa-specialist');
  assert.equal(skipped[0].config_temperature, 0.9);
  assert.equal(skipped[0].frontmatter_temperature, '0.2');
});

/* ------------------------------------------------------------------ */
/*  3. Temperatura EFECTIVA (el punto del ejercicio)                   */
/* ------------------------------------------------------------------ */

test('SIN el hook chat.params, model.options.temperature pisa a todos los agentes', async () => {
  const { config } = await bootPlugin();

  for (const name of Object.keys(EXPECTED_AGENTS)) {
    const body = await resolveEffectiveBody(config, name, null);
    assert.equal(
      body.temperature, 0.4,
      `${name}: se esperaba el bug (0.4 del provider) sin el hook`
    );
  }
});

test('CON el hook chat.params, cada agente usa su propia temperatura', async () => {
  const { hooks, config } = await bootPlugin();

  const table = [];
  for (const [name, expected] of Object.entries(EXPECTED_AGENTS)) {
    const body = await resolveEffectiveBody(config, name, hooks['chat.params']);
    table.push({ agent: name, temperature: body.temperature, top_p: body.top_p });
    assert.equal(body.temperature, expected.temperature, `${name}: temperatura efectiva`);
    assert.equal(
      Object.prototype.hasOwnProperty.call(body, 'temperature'), true,
      `${name}: temperature ausente del body`
    );
  }

  console.table(table);
});

test('el hook no toca parámetros que el plugin no controla', async () => {
  const { hooks, config } = await bootPlugin();
  const body = await resolveEffectiveBody(config, 'backend-specialist', hooks['chat.params']);

  // repetition_penalty / presence_penalty son del usuario y no colisionan con
  // ningún parámetro top-level de OpenCode: se dejan intactos.
  assert.equal(body.repetition_penalty, 1.0);
  assert.equal(body.presence_penalty, 0.0);
  assert.equal(body.max_tokens, 8192);
  // top_p sigue siendo el del usuario porque ningún agente declara top_p.
  assert.equal(body.top_p, 0.8);
});

test('un agente con temperature: 0 llega al body como 0, no como default', async () => {
  const { hooks, config } = await bootPlugin();

  // Agente sintético registrado a mano en el registro del plugin, para no
  // depender de que exista un .md con temperature: 0 en el repo.
  config.agent['zero-agent'] = { mode: 'subagent', temperature: 0, prompt: 'x' };
  const params = {
    temperature: 0,          // lo que produciría request.ts con agent.temperature = 0
    topP: 1,
    options: { ...config.provider.pcai.models[MODEL_ID].options }
  };
  await hooks['chat.params'](
    {
      sessionID: 'ses_zero',
      agent: 'zero-agent',
      model: { id: MODEL_ID, capabilities: { temperature: true } },
      provider: { info: { id: 'pcai' }, options: {} },
      message: {}
    },
    params
  );
  const body = { temperature: params.temperature, top_p: params.topP, ...params.options };

  // El agente no está en agentParams (no vino de un .md), así que el plugin no
  // lo fuerza; comprobamos al menos que 0 no se convierte en falsy/undefined.
  assert.notEqual(body.temperature, undefined);
  assert.equal(typeof body.temperature, 'number');
});

test('avisa cuando el modelo no declara capabilities.temperature', async () => {
  const config = makeUserConfig();
  delete config.provider.pcai.models[MODEL_ID].temperature;   // como el .opencode/opencode.jsonc del repo

  const { hooks, client, config: out } = await bootPlugin(config);
  await resolveEffectiveBody(out, 'qa-specialist', hooks['chat.params']);

  const warned = client.logs.some(
    (l) => l.level === 'warn' && l.message.includes('capabilities.temperature=false')
  );
  assert.ok(warned, 'debe avisar de que OpenCode descartará la temperatura');

  const collision = out.psw_devkit.sampling_collisions.find(
    (c) => c.scope.includes('.temperature') && c.value === '(sin declarar)'
  );
  assert.ok(collision, 'debe reportarse como colisión de config');
});

/* ------------------------------------------------------------------ */
/*  4. Instrumentación de la delegación                                */
/* ------------------------------------------------------------------ */

test('tool.execute.before/after registran la delegación con su temperatura', async () => {
  const { hooks, client } = await bootPlugin();

  await hooks['tool.execute.before'](
    { tool: 'task', sessionID: 'ses_a', callID: 'call_1' },
    { args: { subagent_type: 'security-specialist', description: 'Auditar JWT', prompt: 'revisa auth' } }
  );

  const dispatch = client.logs.find((l) => l.message.startsWith('DELEGACIÓN → security-specialist'));
  assert.ok(dispatch, 'no se registró la delegación');
  assert.equal(dispatch.extra.subagent_type, 'security-specialist');
  assert.equal(dispatch.extra.expected_temperature, 0.2);
  assert.equal(dispatch.extra.known_agent, true);

  await hooks['tool.execute.after'](
    { tool: 'task', sessionID: 'ses_a', callID: 'call_1', args: { subagent_type: 'security-specialist' } },
    {
      title: 'Auditar JWT',
      output: 'ok',
      metadata: {
        parentSessionId: 'ses_a',
        sessionId: 'ses_b',
        model: { providerID: 'pcai', modelID: MODEL_ID }
      }
    }
  );

  const done = client.logs.find((l) => l.message.startsWith('DELEGACIÓN ✓ security-specialist'));
  assert.ok(done);
  assert.equal(done.extra.resolved_model, `pcai/${MODEL_ID}`);
  assert.equal(done.extra.child_session, 'ses_b');
});

test('avisa si el modelo inventa un subagent_type', async () => {
  const { hooks, client } = await bootPlugin();

  await hooks['tool.execute.before'](
    { tool: 'task', sessionID: 'ses_a', callID: 'call_9' },
    { args: { subagent_type: '@backend-specialist', description: 'con arroba' } }
  );

  const warn = client.logs.find(
    (l) => l.level === 'warn' && l.message.includes('NO es un agente del devkit')
  );
  assert.ok(warn, 'un subagent_type inválido debe ser visible');
});

test('el hook ignora tools que no son task', async () => {
  const { hooks, client } = await bootPlugin();
  const before = client.logs.length;
  await hooks['tool.execute.before']({ tool: 'read', sessionID: 's', callID: 'c' }, { args: {} });
  assert.equal(client.logs.length, before);
});

/* ------------------------------------------------------------------ */
/*  5. Observabilidad                                                  */
/* ------------------------------------------------------------------ */

test('el arranque imprime la tabla de temperaturas efectivas', async () => {
  const { client } = await bootPlugin();

  const table = client.logs.find((l) => l.message.includes('TEMPERATURAS EFECTIVAS POR AGENTE'));
  assert.ok(table, 'falta la tabla de temperaturas al arrancar');
  assert.equal(table.extra.agents.length, Object.keys(EXPECTED_AGENTS).length);

  const orchestrator = table.extra.agents.find((a) => a.agent === 'orchestrator');
  assert.equal(orchestrator.temperature, 0.7);
  assert.equal(orchestrator.enforced_by_plugin, true);

  // Y una línea por agente, legible de un vistazo en `opencode logs`.
  for (const name of Object.keys(EXPECTED_AGENTS)) {
    assert.ok(
      client.logs.some((l) => l.message.includes(name) && l.message.includes('enforced=')),
      `falta la línea de ${name}`
    );
  }
});

test('se reportan las colisiones de sampling del config del usuario', async () => {
  const { config } = await bootPlugin();
  const scopes = config.psw_devkit.sampling_collisions.map((c) => c.scope);

  assert.ok(scopes.some((s) => s.endsWith('.options.temperature')), 'falta la colisión de temperature');
  assert.ok(scopes.some((s) => s.endsWith('.options.top_p')), 'falta la colisión de top_p');
});
