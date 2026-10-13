/**
 * Utilidades puras del PSW DevKit (parseo de frontmatter y coerciones).
 *
 * Viven FUERA de .opencode/plugins/ a propósito: OpenCode escanea
 * `{plugin,plugins}/*.{ts,js}` (config/plugin.ts:21) y carga como plugin todo
 * lo que encuentre ahí, exigiendo además que TODOS los exports del módulo sean
 * funciones (plugin/index.ts:105 — "Plugin export is not a function").
 * Por eso los helpers no pueden exportarse desde el propio plugin.
 */

/**
 * Coerción numérica segura para frontmatter.
 * Devuelve `undefined` (= "no definido") SOLO cuando realmente no hay valor
 * o no es numérico. Un 0 legítimo se preserva.
 */
export function toNumber(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const t = value.trim().toLowerCase();
  if (t === 'true' || t === 'yes') return true;
  if (t === 'false' || t === 'no') return false;
  return undefined;
}

/** Quita comillas envolventes de un escalar YAML. */
function unquote(raw) {
  const v = raw.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Quita un comentario ` # ...` al final, respetando comillas. */
function stripComment(value) {
  let quote = null;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(value[i - 1]))) return value.slice(0, i).trim();
  }
  return value.trim();
}

/**
 * Parser de frontmatter YAML (subset) por indentación.
 *
 * Soporta lo que necesitan los agents/commands del devkit:
 *   - anidamiento arbitrario por indentación (antes: solo 2 niveles)
 *   - claves con guiones, p.ej. `backend-specialist: allow`  (antes: /^\w+/)
 *   - escalares entrecomillados
 *   - listas inline `[a, b]` y listas con `- item`
 *   - comentarios `#` a fin de línea
 *
 * Todos los escalares se devuelven como string; la coerción a número/booleano
 * se hace explícitamente en el punto de uso (ver toNumber/toBoolean).
 */
export function parseFrontmatter(content) {
  const m = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/);
  if (!m) return null;

  const root = {};
  // Pila de scopes: cada entrada { indent, container }
  const stack = [{ indent: -1, container: root }];

  const lines = m[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;

    // Comentario de línea completa
    if (/^\s*#/.test(raw)) continue;

    const indent = raw.search(/\S/);
    const line = raw.slice(indent);

    // Desapilar hasta el scope padre correspondiente
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].container;

    // Item de lista: "- valor"
    const listItem = line.match(/^-\s+(.*)$/);
    if (listItem) {
      if (Array.isArray(parent)) parent.push(unquote(stripComment(listItem[1])));
      continue;
    }

    // Par clave: valor  (clave puede llevar - _ . / y estar entrecomillada)
    const kv = line.match(/^("[^"]+"|'[^']+'|[A-Za-z0-9_][A-Za-z0-9_\-./]*)\s*:\s*(.*)$/);
    if (!kv) continue;

    const key = unquote(kv[1]);
    const rest = stripComment(kv[2]);

    if (rest === '') {
      // Bloque anidado: miramos la siguiente línea con contenido para saber
      // si es un mapa o una lista.
      let next = null;
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[j].trim() || /^\s*#/.test(lines[j])) continue;
        next = lines[j];
        break;
      }
      const nextIndent = next ? next.search(/\S/) : -1;
      const isChild = next !== null && nextIndent > indent;
      const container = isChild && /^\s*-\s+/.test(next) ? [] : {};
      parent[key] = container;
      if (isChild) stack.push({ indent, container });
      continue;
    }

    // Lista inline: [a, b, c]
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      parent[key] = inner === '' ? [] : inner.split(',').map((x) => unquote(x));
      continue;
    }

    parent[key] = unquote(rest);
  }

  return { meta: root, body: m[2] };
}
