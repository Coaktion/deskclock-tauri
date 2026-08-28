import type { LlmRateLimits } from "@shared/types/llm";

/** Uma das duas linhas de cota do card, já decidida e já escrita. */
export interface LlmQuotaLine {
  id: "requests" | "tokens";
  /** `312 de 1000` — é número, vai em mono. */
  amount: string;
  /** `requisições` ou `tokens`. */
  noun: string;
  /**
   * O texto de renovação **do provedor**, só sem os decimais (`2m59.56s` →
   * `2m59s`). Ausente quando ele não manda o cabeçalho de reset.
   */
  renewsIn?: string;
}

export interface LlmQuotaView {
  lines: LlmQuotaLine[];
  /** `agora mesmo`, `há 12 minutos`, `há 3 dias`. */
  measuredAgo: string;
  /** A medição envelheceu: os baldes podem ter virado desde então. */
  stale: boolean;
}

/**
 * A partir de quando a medição deixa de descrever o presente.
 *
 * O balde mais curto que os provedores reportam renova em **minutos** (o de
 * tokens por minuto do Groq), então uma hora já basta para que qualquer número
 * guardado possa estar defasado. Não é um prazo de validade — é o ponto em que
 * a tela passa a dizer que aquilo é uma foto, e não o saldo de agora.
 */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * O que o card mostra sobre a cota, ou `null` quando não há o que mostrar.
 *
 * **O período não é afirmado em lugar nenhum desta função, e é o ponto dela.**
 * `x-ratelimit-limit-requests` é por dia no Groq e por minuto na OpenAI, com o
 * mesmo nome de cabeçalho — escrever "requisições hoje" seria falso em metade
 * dos presets. O que se escreve são os números que vieram e o texto de
 * renovação que o próprio provedor mandou, que é correto em todos eles e não
 * depende de uma tabela nossa de janelas por provedor.
 *
 * `null` também quando não há medição nenhuma: a área some, e não vira um "—"
 * nem um convite a gerar um resumo.
 */
export function buildLlmQuotaView(
  limits: LlmRateLimits | undefined,
  measuredAtISO: string,
  now: Date = new Date()
): LlmQuotaView | null {
  const measuredAtMs = parseInstant(measuredAtISO);
  if (measuredAtMs === null) return null;

  const lines = [
    quotaLine(
      "requests",
      "requisições",
      limits?.requestsRemaining,
      limits?.requestsLimit,
      limits?.requestsReset
    ),
    quotaLine(
      "tokens",
      "tokens",
      limits?.tokensRemaining,
      limits?.tokensLimit,
      limits?.tokensReset
    ),
  ].filter((line): line is LlmQuotaLine => line !== null);
  if (lines.length === 0) return null;

  const elapsedMs = now.getTime() - measuredAtMs;
  return {
    lines,
    measuredAgo: formatElapsed(elapsedMs),
    stale: elapsedMs >= STALE_AFTER_MS,
  };
}

/**
 * Uma linha só existe com **restante e limite**: "restam 312" sem o total não
 * diz se é folga ou aperto, e o total sem o restante não diz nada sobre agora.
 */
function quotaLine(
  id: LlmQuotaLine["id"],
  noun: string,
  remaining: number | undefined,
  limit: number | undefined,
  reset: string | undefined
): LlmQuotaLine | null {
  if (remaining === undefined || limit === undefined) return null;

  const line: LlmQuotaLine = { id, noun, amount: `${remaining} de ${limit}` };
  const renewsIn = trimResetDecimals(reset);
  return renewsIn ? { ...line, renewsIn } : line;
}

/** `2m59.56s` → `2m59s`. O centésimo de segundo não muda decisão nenhuma. */
function trimResetDecimals(reset: string | undefined): string | undefined {
  const trimmed = reset?.trim();
  return trimmed ? trimmed.replace(/(\d+)\.\d+/g, "$1") : undefined;
}

function parseInstant(iso: string): number | null {
  if (iso.trim() === "") return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Tempo decorrido em português, para dizer **de quando** é a medição.
 *
 * Mora aqui, e não em `shared/utils/time.ts`, porque este é o único call site —
 * o app não tinha formatador de tempo relativo, e criar um utilitário
 * compartilhado a partir de um consumidor é generalizar antes da hora.
 *
 * Medição no futuro (relógio da máquina atrasado desde a última chamada) lê como
 * "agora mesmo": é o mais próximo da verdade que se pode dizer sem inventar.
 */
function formatElapsed(elapsedMs: number): string {
  if (elapsedMs < MINUTE_MS) return "agora mesmo";
  if (elapsedMs < HOUR_MS) return plural(Math.floor(elapsedMs / MINUTE_MS), "minuto");
  if (elapsedMs < DAY_MS) return plural(Math.floor(elapsedMs / HOUR_MS), "hora");
  return plural(Math.floor(elapsedMs / DAY_MS), "dia");
}

function plural(value: number, unit: string): string {
  return `há ${value} ${unit}${value === 1 ? "" : "s"}`;
}
