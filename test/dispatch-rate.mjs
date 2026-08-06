/**
 * Test de INTEGRACIÓN de la orquestación (no determinista).
 *
 * Lanza prompts reales contra el orchestrator y mide, usando la instrumentación
 * del propio plugin (hook tool.execute.before/after sobre la tool `task`):
 *   (a) si el orchestrator llamó de verdad a la tool `task`
 *   (b) a qué subagente
 *   (c) con qué temperatura efectiva corrió cada uno
 *
 * HONESTIDAD: si el modelo DECIDE delegar no es determinista. Por eso cada
 * prompt se corre N veces y se reporta la TASA de despacho y su consistencia,
 * no un pass/fail duro. Lo determinista está en orchestration.test.mjs.
 *
 * Uso (desde WSL, donde vive opencode):
 *
 *   HOME=/tmp/psw-orch/home \
 *   NODE_TLS_REJECT_UNAUTHORIZED=0 \
 *   node test/dispatch-rate.mjs --runs 3
 *
 * Variables de entorno:
 *   OPENCODE_BIN   ruta al binario (default: `opencode` en el PATH)
 *   PSW_RUNS       nº de repeticiones por prompt (default 3)
 *   PSW_WORKDIR    cwd para las sesiones (default: un tmpdir)
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OPENCODE_BIN = process.env.OPENCODE_BIN || 'opencode';
const RUNS = Number(
  process.env.PSW_RUNS ?? (process.argv.includes('--runs') ? process.argv[process.argv.indexOf('--runs') + 1] : 3)
);
const WORKDIR = process.env.PSW_WORKDIR || fs.mkdtempSync(path.join(os.tmpdir(), 'psw-dispatch-'));
const TIMEOUT_MS = Number(process.env.PSW_TIMEOUT_MS ?? 300_000);

/** Prompts representativos y el especialista que *debería* atenderlos. */
const CASES = [
  {
    id: 'scaffold',
    prompt:
      'Necesito crear un nuevo proyecto: una solution .NET de microservicios para gestión de pedidos, ' +
      'con Clean Architecture. Arranca el scaffold.',
    expect: 'backend-specialist'
  },
  {
    id: 'security',
    prompt:
      'Audita la seguridad de la autenticación JWT de este repositorio y dime qué vulnerabilidades OWASP ves.',
    expect: 'security-specialist'
  },
  {
    id: 'frontend',
    prompt: 'Crea un componente Blazor WASM con MudBlazor para listar pedidos en una tabla paginada.',
    expect: 'frontend-specialist'
  },
  {
    id: 'devops',
    prompt: 'Prepara el Dockerfile multi-stage y el docker-compose para desplegar estos microservicios.',
    expect: 'devops-specialist'
  },
  {
    id: 'qa',
    prompt: 'Escribe los tests unitarios con xUnit del caso de uso CreateOrder y dime el coverage.',
    expect: 'qa-specialist'
  }
];

function runOnce(prompt, tracePath) {
  return new Promise((resolve) => {
    try { fs.rmSync(tracePath, { force: true }); } catch {}

    const child = spawn(
      OPENCODE_BIN,
      ['run', '--agent', 'orchestrator', '--format', 'json', prompt],
      {
        cwd: WORKDIR,
        // PWD explícito: OpenCode resuelve el directorio de trabajo desde la
        // variable PWD y no desde el cwd real del proceso. Si se hereda el PWD
        // del shell que lanzó este script, la sesión arranca en OTRO proyecto.
        env: { ...process.env, PWD: WORKDIR, PSW_DEVKIT_TRACE: tracePath },
        stdio: ['ignore', 'pipe', 'pipe']
      }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);

      // Fuente primaria: la instrumentación del plugin.
      const trace = [];
      try {
        for (const line of fs.readFileSync(tracePath, 'utf8').split('\n')) {
          if (line.trim()) trace.push(JSON.parse(line));
        }
      } catch {}

      // Contraste: los eventos JSON del propio runner de OpenCode.
      const toolCalls = [];
      for (const line of stdout.split('\n')) {
        if (!line.trim().startsWith('{')) continue;
        try {
          const ev = JSON.parse(line);
          const part = ev.part;
          if (part?.type === 'tool' && part.tool === 'task') {
            toolCalls.push(part.state?.input?.subagent_type ?? part.state?.metadata?.subagent_type ?? '(?)');
          }
        } catch {}
      }

      const dispatches = trace.filter((t) => t.kind === 'task.dispatch' && t.phase === 'before');
      const params = trace.filter((t) => t.kind === 'chat.params');
      // Una corrida es válida si el orchestrator llegó a hablar con el modelo.
      // OJO: no basta con buscar `"type":"error"` en stdout — los rechazos de
      // permisos (external_directory, etc.) también se emiten como error y no
      // son fallos de la corrida.
      const errored = !params.some((p) => p.agent === 'orchestrator');

      resolve({
        exitCode: code,
        errored,
        dispatched: dispatches.length > 0,
        subagents: [...new Set(dispatches.map((d) => d.subagent_type))],
        temps: Object.fromEntries(params.map((p) => [p.agent, p.effective_temperature])),
        toolCallsFromEvents: toolCalls,
        stderrTail: stderr.slice(-400)
      });
    });
  });
}

const results = [];

console.log(`# Test de despacho de orquestación`);
console.log(`  binario : ${OPENCODE_BIN}`);
console.log(`  cwd     : ${WORKDIR}`);
console.log(`  runs    : ${RUNS} por prompt (${CASES.length} prompts = ${RUNS * CASES.length} sesiones)\n`);

for (const testCase of CASES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    process.stdout.write(`  ${testCase.id} [${i + 1}/${RUNS}] ... `);
    const r = await runOnce(testCase.prompt, path.join(WORKDIR, `trace-${testCase.id}-${i}.jsonl`));
    runs.push(r);
    console.log(
      r.errored ? 'ERROR' : r.dispatched ? `task → ${r.subagents.join(', ')}` : 'sin delegación'
    );
  }

  const ok = runs.filter((r) => !r.errored);
  const dispatched = ok.filter((r) => r.dispatched);
  const correct = dispatched.filter((r) => r.subagents.includes(testCase.expect));

  results.push({
    prompt: testCase.id,
    esperado: testCase.expect,
    runs_validos: ok.length,
    'tasa_despacho': ok.length ? `${dispatched.length}/${ok.length}` : 'n/a',
    'tasa_acierto': ok.length ? `${correct.length}/${ok.length}` : 'n/a',
    subagentes_vistos: [...new Set(dispatched.flatMap((r) => r.subagents))].join(', ') || '—'
  });
}

console.log('\n## Tasa de despacho por prompt\n');
console.table(results);

// Temperaturas efectivas observadas en TODAS las sesiones (padre + hijas).
const temps = {};
for (const file of fs.readdirSync(WORKDIR).filter((f) => f.startsWith('trace-'))) {
  for (const line of fs.readFileSync(path.join(WORKDIR, file), 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const t = JSON.parse(line);
      if (t.kind !== 'chat.params') continue;
      (temps[t.agent] ??= new Set()).add(t.effective_temperature);
    } catch {}
  }
}

console.log('\n## Temperatura EFECTIVA observada por agente (todas las sesiones)\n');
console.table(
  Object.entries(temps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([agent, set]) => ({
      agent,
      temperaturas_observadas: [...set].join(', '),
      consistente: set.size === 1 ? 'sí' : 'NO ⚠'
    }))
);

console.log(`\nTrazas crudas en: ${WORKDIR}`);
