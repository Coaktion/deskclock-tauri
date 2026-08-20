import type { ScheduleType } from "@domain/entities/PlannedTask";
import type { MondayColumnValue, MondayItem } from "@shared/types/monday";
import { addDaysISO, localDateISO } from "@shared/utils/time";

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
 * Coluna `date` (as atividades): `{"date":"…"}`, ou `{"date":"…","time":"…"}`
 * **em UTC** nas atividades antigas.
 *
 * O envio hoje grava só o dia (`serializeDate`), mas o board guarda as duas
 * formas: com hora, o instante é convertido para o dia local; sem hora, a data
 * já **é** o dia e não sofre conversão, senão toda atividade lançada sem horário
 * recuaria um dia em fuso negativo. As duas continuam sendo lidas.
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

/**
 * Folga entre a janela mais antiga e o piso da busca.
 *
 * Absorve o que o recorte do servidor enxerga diferente da tela: o par de datas
 * invertido à mão no board (que `parseDatePairPeriod` desvira aqui, mas a regra
 * do Monday lê como está), e a virada do dia com o app aberto, já que o piso é
 * calculado uma vez por montagem. Uma semana a mais de atividades não pesa; um
 * item sumindo do gerenciador sem explicação, sim.
 */
const SEARCH_FLOOR_SLACK_DAYS = 7;

/**
 * Dia mais antigo que a busca do gerenciador precisa alcançar.
 *
 * As quatro janelas (hoje, 7 dias, 30 dias, este mês) olham só para trás, e a
 * mais antiga é a que manda: no dia 31 é o começo do mês, no dia 1º são os 30
 * dias. É este piso que impede a consulta de crescer indefinidamente — sem ele
 * ela baixa todas as atividades já enviadas, desde sempre.
 */
export function searchFloorDayISO(todayISO: string): string {
  const startOfMonth = `${todayISO.slice(0, 8)}01`;
  const thirtyDaysBack = addDaysISO(todayISO, -29);
  const oldest = startOfMonth < thirtyDaysBack ? startOfMonth : thirtyDaysBack;
  return addDaysISO(oldest, -SEARCH_FLOOR_SLACK_DAYS);
}

/** Dois períodos são o mesmo quando as duas pontas coincidem. */
export function samePeriod(a: MondayItemPeriod | null, b: MondayItemPeriod | null): boolean {
  if (!a || !b) return a === b || (!a && !b);
  return a.startDayISO === b.startDayISO && a.endDayISO === b.endDayISO;
}

/** O agendamento da planejada que corresponde ao intervalo do item. */
export interface MondayItemSchedule {
  scheduleType: ScheduleType;
  scheduleDate: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

/**
 * Traduz a Timeline do item em agendamento: um dia vira `specific_date`, vários
 * viram `period` — que é justamente o tipo que existe para trabalho espalhado
 * por uma faixa de dias (§5.3). Item sem Timeline cai no dia corrente, para não
 * nascer invisível no planejamento.
 *
 * Compartilhado pela criação e pela atualização: se cada uma tivesse a sua
 * regra, remarcar um item no Monday poderia gerar um agendamento que o import
 * nunca produziria.
 */
export function periodToSchedule(
  period: MondayItemPeriod | null,
  fallbackDayISO: string
): MondayItemSchedule {
  const isRange = period != null && period.startDayISO !== period.endDayISO;
  return {
    scheduleType: isRange ? "period" : "specific_date",
    scheduleDate: isRange ? null : (period?.startDayISO ?? fallbackDayISO),
    periodStart: isRange ? period.startDayISO : null,
    periodEnd: isRange ? period.endDayISO : null,
  };
}
