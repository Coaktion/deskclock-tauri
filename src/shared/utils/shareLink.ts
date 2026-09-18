/**
 * Contrato do deeplink de compartilhamento de tarefa planejada.
 *
 * Formato:
 *   deskclock://task/share?name=…&project=…&category=…&billable=true|false
 *                         &start=HH:MM&end=HH:MM&cf.<rótulo>=<valor>
 *
 * Projeto e categoria viajam por **nome**, e campo personalizado por **rótulo**
 * (valor de `select` pelo rótulo da opção): id é local de cada banco e não
 * atravessa máquinas. Agendamento, recorrência, período, ações, ids e workspace
 * não fazem parte do contrato — se aparecerem na URL, são ignorados.
 */

export interface SharedTaskPayload {
  name: string;
  projectName?: string;
  categoryName?: string;
  billable: boolean;
  startTime?: string;
  endTime?: string;
  /** Indexado pelo rótulo do campo personalizado. */
  customValues: Record<string, string>;
}

export const SHARE_LINK_SCHEME = "deskclock";
export const SHARE_LINK_PATH = "task/share";
const CUSTOM_FIELD_PREFIX = "cf.";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const LINK_PATTERN = /^deskclock:\/\/task\/share\/?(?:\?([\s\S]*))?$/i;

function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function appendParam(parts: string[], key: string, value: string | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  parts.push(`${encode(key)}=${encode(trimmed)}`);
}

/** Monta a URL de compartilhamento. Campos ausentes ou vazios não entram na query. */
export function buildShareLink(payload: SharedTaskPayload): string {
  const parts: string[] = [];

  appendParam(parts, "name", payload.name);
  appendParam(parts, "project", payload.projectName);
  appendParam(parts, "category", payload.categoryName);
  if (!payload.billable) parts.push("billable=false");
  if (payload.startTime && isValidTime(payload.startTime)) {
    appendParam(parts, "start", payload.startTime);
  }
  if (payload.endTime && isValidTime(payload.endTime)) {
    appendParam(parts, "end", payload.endTime);
  }

  for (const [label, value] of Object.entries(payload.customValues ?? {})) {
    const trimmedLabel = label.trim();
    if (!trimmedLabel) continue;
    appendParam(parts, `${CUSTOM_FIELD_PREFIX}${trimmedLabel}`, value);
  }

  const query = parts.join("&");
  const base = `${SHARE_LINK_SCHEME}://${SHARE_LINK_PATH}`;
  return query ? `${base}?${query}` : base;
}

/**
 * Lê o payload a partir do mapa de query **já decodificado** — é o formato que
 * o lado Rust entrega. Devolve `null` sem `name`. Chave desconhecida e hora fora
 * de `HH:MM` são descartadas em silêncio.
 */
export function parseShareParams(params: Record<string, string>): SharedTaskPayload | null {
  const name = params["name"]?.trim();
  if (!name) return null;

  const customValues: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(params)) {
    if (!key.startsWith(CUSTOM_FIELD_PREFIX)) continue;
    // O prefixo é só o primeiro "cf." — o resto é o rótulo inteiro, ponto incluso.
    const label = key.slice(CUSTOM_FIELD_PREFIX.length).trim();
    const value = rawValue?.trim();
    if (!label || !value) continue;
    customValues[label] = value;
  }

  const projectName = params["project"]?.trim() || undefined;
  const categoryName = params["category"]?.trim() || undefined;
  const start = params["start"]?.trim();
  const end = params["end"]?.trim();

  return {
    name,
    projectName,
    categoryName,
    billable: params["billable"]?.trim().toLowerCase() !== "false",
    startTime: start && isValidTime(start) ? start : undefined,
    endTime: end && isValidTime(end) ? end : undefined,
    customValues,
  };
}

function decodeComponent(value: string): string | null {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return null;
  }
}

/** Lê o payload a partir da URL inteira colada pelo usuário. */
export function parseShareLink(raw: string): SharedTaskPayload | null {
  const match = LINK_PATTERN.exec(raw.trim());
  if (!match) return null;

  const params: Record<string, string> = {};
  const query = match[1] ?? "";
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const separator = pair.indexOf("=");
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    const rawValue = separator === -1 ? "" : pair.slice(separator + 1);
    const key = decodeComponent(rawKey);
    const value = decodeComponent(rawValue);
    if (key === null || value === null) continue;
    if (!(key in params)) params[key] = value;
  }

  return parseShareParams(params);
}
