# Precedencia real de `temperature` en OpenCode

Verificado leyendo el código de **OpenCode 1.18.14** (`sst/opencode @ v1.18.14`)
y de **`@ai-sdk/openai-compatible@2.0.41`**, que es el provider npm que usa PSW.
No es documentación oficial: son las líneas de código que deciden el valor.

## El orden (gana el ÚLTIMO)

```
provider.<id>.options.temperature        ← SIN EFECTO (ver nota 1)
ProviderTransform.temperature(model)     ← default por familia (qwen ⇒ 0.55)
agent.temperature                        ← lo que inyecta este plugin
agent.options.temperature
provider.<id>.models.<modelo>.options.temperature   ← GANA SIEMPRE
```

Y por encima de todo eso hay una compuerta:

```
provider.<id>.models.<modelo>.temperature: true   ← si falta, NO se envía nada
```

## Por qué, paso a paso

### 1. La compuerta de capabilities

`packages/opencode/src/provider/provider.ts:1461`

```ts
capabilities: {
  temperature: model.temperature ?? existingModel?.capabilities.temperature ?? false,
  ...
}
```

Para un provider **custom** (como `pcai`, que no está en models.dev) no hay
`existingModel`, así que si el modelo no declara `"temperature": true`, la
capability queda en `false`.

`packages/opencode/src/session/llm/request.ts:124`

```ts
temperature: input.model.capabilities.temperature
  ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
  : undefined,
```

Con la capability en `false` **no se manda temperatura ninguna** y toda la
configuración por agente es decorativa.

> El `.opencode/opencode.jsonc` de este repo no declaraba `"temperature": true`.
> El `~/.config/opencode/opencode.jsonc` del usuario sí.

### 2. `agent.temperature` gana al default del modelo

Misma línea: `input.agent.temperature ?? ProviderTransform.temperature(model)`.
`ProviderTransform.temperature` (`provider/transform.ts:526`) devuelve `0.55`
para cualquier id que contenga `qwen`. Un agente con temperatura propia lo pisa.

Y en `agent/agent.ts:285` el merge del config usa `??`, no truthy:

```ts
item.temperature = value.temperature ?? item.temperature
```

⇒ **un `temperature: 0` en el config de OpenCode sí sobrevive**. El bug del `0`
estaba únicamente en este plugin (`if (meta.temperature)`), no en OpenCode.

### 3. Las `options` viajan por otro carril y ganan

`session/llm/request.ts:90`

```ts
const options = mergeOptions(
  mergeOptions(mergeOptions(base, input.model.options), input.agent.options),
  variant
)
```

`base` sale de `ProviderTransform.options({ model, sessionID, providerOptions })`.

**Nota 1** — de `provider.<id>.options` esa función sólo lee `setCacheKey` y
`useCompletionUrls` (`transform.ts:1253`, `1276`). El resto de `provider.options`
va al **constructor del SDK** (`baseURL`, `timeout`, `apiKey`…), no a la request.
Poner `temperature` ahí no hace nada en 1.18.14.

En cambio `provider.<id>.models.<modelo>.options` entra **entero**.

Después, `session/llm.ts:313`:

```ts
providerOptions: ProviderTransform.providerOptions(input.model, prepared.params.options)
// ⇒ { "pcai": { max_tokens, temperature, top_p, ... } }
```

La clave es `model.providerID.split(".")[0]` (`transform.ts:1408`), que coincide
con el `providerOptionsName` que lee el SDK.

### 4. El spread final del provider

`@ai-sdk/openai-compatible@2.0.41`, `getArgs()`:

```js
args: {
  model: this.modelId,
  max_tokens: maxOutputTokens,
  temperature,                 // ← el valor calculado en el paso 2
  top_p: topP,
  frequency_penalty, presence_penalty, response_format, stop, seed,
  ...Object.fromEntries(
    Object.entries({ ...providerOptions?.[this.providerOptionsName], ... })
      .filter(([key]) => !Object.keys(openaiCompatibleLanguageModelChatOptions.shape).includes(key))
  ),                           // ← SPREAD DESPUÉS ⇒ pisa lo anterior
  ...
}
```

El filtro sólo quita las opciones propias del SDK (`user`, `reasoningEffort`,
`textVerbosity`). `temperature`, `top_p` y `max_tokens` **no** están filtrados,
así que pasan tal cual y sobrescriben los parámetros estándar.

## Consecuencia práctica

Con este `~/.config/opencode/opencode.jsonc`:

```jsonc
"models": {
  "Qwen/Qwen3.6-35B-A3B-FP8": {
    "temperature": true,
    "options": { "temperature": 0.4, "top_p": 0.8, "max_tokens": 8192 }
  }
}
```

…**todos** los agentes corrían a `0.4`: el orchestrator (0.7) y los seis
especialistas (0.2–0.4). La temperatura por rol no tenía ningún efecto.

## Las dos soluciones

### A. Quitarlo del config (manual, permanente)

Sacar `temperature` y `top_p` de `models.<modelo>.options` y dejar sólo:

```jsonc
"models": {
  "Qwen/Qwen3.6-35B-A3B-FP8": {
    "temperature": true,
    "limit": { "context": 262144, "output": 8192 },
    "options": {
      "max_tokens": 8192,
      "repetition_penalty": 1.0,
      "presence_penalty": 0.0
    }
  }
}
```

Con eso, `agent.temperature` llega intacto al body.

### B. Dejar que el plugin lo neutralice (lo implementado)

El hook `chat.params` corre justo entre el paso 2 y el 3 y hace **dos** cosas,
no una:

```js
output.temperature = spec.temperature;        // (a) fija la del agente
delete output.options.temperature;            // (b) quita la que la pisaría
```

Sin (b), (a) no sirve de nada. Ver `.opencode/plugins/psw-devkit.js`.

Esta opción respeta el diseño zero-disco: no toca el `opencode.jsonc` del
usuario, sólo la request en vuelo. Los parámetros que el plugin **no** controla
(`repetition_penalty`, `presence_penalty`, `max_tokens`, y `top_p` mientras
ningún agente declare el suyo) se dejan intactos.

## Herencia en subagentes lanzados con `task`

- **Modelo: SÍ se hereda.** `tool/task.ts:181`

  ```ts
  const model = next.model ?? { modelID: msg.info.modelID, providerID: msg.info.providerID }
  ```

  Si el subagente no declara `model` en su frontmatter, usa el del padre.

- **Temperatura: NO se hereda.** La sesión hija se promptea con
  `agent: next.name` (`task.ts:207`) y `session/prompt.ts:1169` vuelve a
  resolver el `Agent.Info` por nombre, así que `request.ts:124` lee la
  temperatura propia del subagente. El hook `chat.params` la vuelve a forzar
  también en la sesión hija.

- **`subagent_type` NO es un enum.** Es `Schema.String` (`task.ts:47`). Los
  subagentes disponibles se anuncian en la *descripción* de la tool
  (`tool/registry.ts:259`), que filtra por `mode !== "primary"` y por que
  `permission.task` del agente llamante no sea `deny`.

## Cómo auditarlo

```bash
opencode logs | grep psw-devkit
```

Al arrancar imprime la tabla de temperaturas por agente, y en cada turno una
línea `chat.params · agent=X · temp efectiva=Y`. Para volcado a fichero:

```bash
PSW_DEVKIT_TRACE=/tmp/psw-trace.jsonl opencode
```
