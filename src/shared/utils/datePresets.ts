import { addDaysISO, startOfMonthISO, todayISO, weekBoundsISO } from "@shared/utils/time";

/**
 * A tabela única dos períodos que o app oferece pronto.
 *
 * **Ela existia três vezes**, escrita à mão em `useHistory`, em
 * `useTaskSendSelection` e inline no `ClockifyEntriesModal`, com dois
 * vocabulários diferentes para a mesma aritmética: `7days` num lado e `week` no
 * outro, os dois calculando `hoje − 6 … hoje`. Cada tela que ganhava um atalho
 * novo escolhia um dos dois nomes, e a escolha não significava nada.
 *
 * **Os ids daqui não são os das telas.** Cada hook mantém o vocabulário que já
 * expunha (`QuickFilter`, `QuickPeriod`) e traduz para estes ids — trocar o
 * vocabulário público mexeria em `QUICK_LABELS` de quatro telas para não mudar
 * comportamento nenhum. O que se unifica é a conta, não o nome.
 *
 * **`last7` não é "esta semana".** É uma janela móvel de sete dias terminando
 * hoje; `thisWeek` é a semana do calendário, de segunda a domingo. Os dois
 * conviviam sob o nome `week` em telas diferentes, e é a distinção que o rótulo
 * "7 dias" do `TaskSendModal` já fazia — só o código é que não.
 */
export type DateRangeId =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisWeek"
  | "lastWeek"
  | "nextWeek"
  | "thisMonth"
  | "lastMonth";

export interface DateRange {
  /** ISO `AAAA-MM-DD`, inclusivo. */
  start: string;
  /** ISO `AAAA-MM-DD`, inclusivo. */
  end: string;
}

export const DATE_RANGE_LABELS: Record<DateRangeId, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "7 dias",
  last30: "30 dias",
  thisWeek: "Esta semana",
  lastWeek: "Semana passada",
  nextWeek: "Próxima semana",
  thisMonth: "Este mês",
  lastMonth: "Mês passado",
};

/**
 * O primeiro e o último dia do mês que contém `dateISO`.
 *
 * O fim sai de "dia 1 do mês seguinte, menos um": é o que dispensa a tabela de
 * quantos dias tem cada mês e acerta fevereiro bissexto de graça.
 */
function monthBounds(dateISO: string): DateRange {
  const [year, month] = dateISO.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth =
    month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end: addDaysISO(nextMonth, -1) };
}

/** O período de um atalho, sempre relativo a hoje. */
export function dateRangeFor(id: DateRangeId): DateRange {
  const today = todayISO();
  const week = weekBoundsISO();

  switch (id) {
    case "today":
      return { start: today, end: today };
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return { start: y, end: y };
    }
    case "last7":
      return { start: addDaysISO(today, -6), end: today };
    case "last30":
      return { start: addDaysISO(today, -29), end: today };
    case "thisWeek":
      return week;
    case "lastWeek":
      return { start: addDaysISO(week.start, -7), end: addDaysISO(week.end, -7) };
    case "nextWeek":
      return { start: addDaysISO(week.start, 7), end: addDaysISO(week.end, 7) };
    // `thisMonth` termina **hoje**, não no fim do mês: é o que as três cópias
    // faziam, e num app de horas o mês corrente é o que já se trabalhou dele.
    case "thisMonth":
      return { start: startOfMonthISO(), end: today };
    case "lastMonth":
      return monthBounds(addDaysISO(startOfMonthISO(), -1));
  }
}

/** O atalho cujo período coincide com o par recebido, se houver algum. */
export function matchDateRange(start: string, end: string, ids: DateRangeId[]): DateRangeId | null {
  return (
    ids.find((id) => {
      const range = dateRangeFor(id);
      return range.start === start && range.end === end;
    }) ?? null
  );
}
