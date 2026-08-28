/**
 * A leitura tolerante de uma resposta que **deveria** ser JSON.
 *
 * Ela mora aqui, e não dentro de um dos parsers, porque são dois: o plano da
 * semana e o preenchimento de lacunas. Os dois recebem resposta do mesmo tipo de
 * modelo, sujeita aos mesmos desvios, e uma segunda grafia divergiria da
 * primeira no primeiro desvio novo — que é exatamente o que ninguém veria.
 *
 * **Por que a tolerância é obrigatória:** não há `response_format` no request —
 * ele quebraria num dos onze provedores, pelo mesmo motivo de `max_tokens` —,
 * então o formato é combinado só no prompt, e prompt é pedido, não garantia.
 */

/**
 * O primeiro valor JSON balanceado do texto, ou `null` se não houver nenhum.
 *
 * Resolve de uma vez a cerca de markdown, o "Claro! Aqui está:" antes e o
 * "Espero ter ajudado" depois — as três formas em que a resposta chega suja. As
 * aspas são respeitadas, ou uma tarefa chamada "Revisar [PRs] do {backend}"
 * fecharia o objeto no lugar errado.
 */
export function extractJson(raw: string): string | null {
  const start = raw.search(/[{[]/);
  if (start === -1) return null;

  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

/**
 * A lista de itens de uma resposta, seja ela a lista crua, o objeto com a chave
 * combinada, ou o objeto que embrulhou a lista sob outro nome.
 *
 * O último caso não é indulgência: o modelo às vezes troca "tarefas" por "plano"
 * ou "items", e procurar a lista **pelo tipo** custa menos que adivinhar o nome.
 */
export function jsonItemList(raw: string, key: string): unknown[] {
  const json = extractJson(raw);
  if (json === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed[key])) return parsed[key];
  return Object.values(parsed).find(Array.isArray) ?? [];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Texto não vazio, aparado — ou `undefined`, que é como "sem valor" viaja. */
export function textValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
