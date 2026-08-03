import type { MondayColumnValue, MondayItem } from "@shared/types/monday";
import { localDateISO } from "@shared/utils/time";

/**
 * Intervalo de um item do Monday, em **dias locais** (AAAA-MM-DD).
 *
 * Dias, e não instantes, porque é assim que o Monday guarda os dois lados: a
 * coluna `timeline` só tem data, e a `date` tem precisão de minuto mas é usada
 * pelo template para marcar o dia da atividade. Item de um dia só vem com
 * `startDayISO === endDayISO`.
 */
export interface MondayItemPeriod {
  startDayISO: string;
  endDayISO: string;
}

export function findColumnValue(
  item: MondayItem,
  columnId: string | undefined
): MondayColumnValue | undefined {
  if (!columnId) return undefined;
  return item.columnValues.find((c) => c.id === columnId);
}

function parseJson<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Coluna `timeline` (os itens de trabalho): `{"from":"…","to":"…"}`, sem hora.
 *
 * As datas já são o dia pretendido, então entram como estão. Passá-las por
 * `new Date()` as interpretaria como meia-noite UTC e, em fuso negativo, o dia
 * andaria para trás — o defeito do §6.6.
 */
export function parseTimelinePeriod(value: MondayColumnValue | undefined): MondayItemPeriod | null {
  const parsed = parseJson<{ from?: string | null; to?: string | null }>(value?.value);
  const from = parsed?.from;
  if (!from) return null;
  return { startDayISO: from, endDayISO: parsed.to || from };
}

/**
 * Coluna `date` (as atividades): `{"date":"…","time":"…"}`, **em UTC**.
 *
 * Com hora, o instante é convertido para o dia local — é o inverso exato do
 * `serializeDate` do envio. Sem hora, a data já é o dia e não sofre conversão,
 * senão toda atividade lançada sem horário recuaria um dia.
 */
export function parseDayValue(value: MondayColumnValue | undefined): string | null {
  const parsed = parseJson<{ date?: string | null; time?: string | null }>(value?.value);
  const date = parsed?.date;
  if (!date) return null;
  return parsed.time ? localDateISO(`${date}T${parsed.time}Z`) : date;
}

/** Intervalo a partir do par Start Date / End Date, como o sender o grava. */
export function parseDatePairPeriod(
  start: MondayColumnValue | undefined,
  end: MondayColumnValue | undefined
): MondayItemPeriod | null {
  const startDayISO = parseDayValue(start);
  const endDayISO = parseDayValue(end);
  const first = startDayISO ?? endDayISO;
  if (!first) return null;
  const last = endDayISO ?? startDayISO ?? first;
  // Ordem invertida no board (alguém trocou as pontas à mão) viraria um
  // intervalo vazio, e o item sumiria de todo filtro sem explicação.
  return first <= last
    ? { startDayISO: first, endDayISO: last }
    : { startDayISO: last, endDayISO: first };
}

/**
 * O item entra no filtro quando o intervalo dele **cruza** a janela — não só
 * quando começa dentro dela. Uma atividade de 01/07 a 28/07 pertence a todo dia
 * do meio, e filtrar pelo início a esconderia de 26 dos 28 dias que cobre.
 *
 * Comparação lexicográfica: em AAAA-MM-DD ela é idêntica à cronológica.
 */
export function periodOverlaps(
  period: MondayItemPeriod | null,
  fromDayISO: string,
  toDayISO: string
): boolean {
  if (!period) return false;
  return period.startDayISO <= toDayISO && period.endDayISO >= fromDayISO;
}
