import { TaskTextResponseError } from "./errors";
import type { TaskFieldHint, TaskTextFields } from "./types";

/** Fim do objeto que abre em `start`, contando chaves fora de string; `-1` se não fecha. */
function objectEnd(raw: string, start: number): number {
  let depth = 0;
  let inString = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i;
  }
  return -1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * O primeiro objeto JSON que o texto contém. Procura em vez de dar `JSON.parse`
 * no texto inteiro porque o prompt pede "sem markdown", mas modelo pequeno
 * devolve cerca de código ou uma frase antes do JSON mesmo assim.
 */
function firstJsonObject(raw: string): Record<string, unknown> | null {
  for (let start = raw.indexOf("{"); start !== -1; start = raw.indexOf("{", start + 1)) {
    const end = objectEnd(raw, start);
    if (end === -1) continue;
    try {
      const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
      if (isPlainObject(parsed)) return parsed;
    } catch {
      // Chave aberta que não era o começo do JSON — segue para a próxima.
    }
  }
  return null;
}

/**
 * Lê a resposta do provedor em `{ name, fields }`.
 *
 * Tolerante no que é ruído — sigla em minúscula volta à forma da instrução,
 * sigla desconhecida e valor que não é texto são descartados —, porque um campo
 * a menos se completa na prévia. Sem objeto JSON nenhum, ou com `fields` que
 * não é objeto, não há o que mostrar: `TaskTextResponseError`.
 */
export function parseTaskTextResponse(raw: string, hints: TaskFieldHint[]): TaskTextFields {
  const parsed = firstJsonObject(raw);
  if (!parsed) throw new TaskTextResponseError();
  const rawFields = parsed.fields ?? {};
  if (!isPlainObject(rawFields)) throw new TaskTextResponseError();

  const canonical = new Map(hints.map((h) => [h.sigla.toUpperCase(), h.sigla]));
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    const sigla = canonical.get(key.trim().toUpperCase());
    if (sigla && typeof value === "string" && value.trim()) fields[sigla] = value.trim();
  }

  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  return { name, fields };
}
