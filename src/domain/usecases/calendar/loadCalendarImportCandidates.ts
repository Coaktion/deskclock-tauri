import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { CalendarEvent, ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import { findByNameCaseInsensitive, parseCalendarMetadata } from "@shared/utils/calendarMetadata";
import { isWeekendDay } from "@shared/utils/weekdays";
import { isEventIgnored } from "./isEventIgnored";
import { nameKey } from "./nameKey";

/** O que um evento vira se ninguém mexer na linha dele. */
export interface CalendarEventDefaults {
  projectId: string | null;
  projectName: string;
  categoryId: string | null;
  categoryName: string;
  scheduleType: "specific_date" | "recurring";
  recurringDays: number[];
}

export interface CalendarImportCandidate {
  event: CalendarEvent;
  defaults: CalendarEventDefaults;
  /** Já há planejada de mesmo nome no workspace de destino, no período (chip "já existe"). */
  alreadyExists: boolean;
  /** Casa com uma regra de "Eventos ignorados". */
  ignored: boolean;
  /** Vem marcado na tela: nem "já existe" nem ignorado. */
  preselected: boolean;
}

export interface LoadCalendarImportCandidatesParams {
  /** Primeiro e último dia local do período, YYYY-MM-DD. */
  fromDay: string;
  toDay: string;
  /** Workspace de destino do import — o da integração. */
  workspaceId: string;
  showWeekend: boolean;
  ignoreRules: CalendarIgnoreRule[];
  /** Catálogo do workspace de destino, para casar os metadados da descrição. */
  projects: Project[];
  categories: Category[];
}

function isWeekend(dateISO: string): boolean {
  return isWeekendDay(new Date(dateISO + "T12:00:00").getDay());
}

/** Descarta o que a semana desta janela não mostra — nada, com o fim de semana ligado. */
export function onlyVisibleDays(days: number[], showWeekend: boolean): number[] {
  return showWeekend ? days : days.filter((d) => !isWeekendDay(d));
}

/**
 * A sugestão do evento: projeto e categoria pelos metadados da descrição, e
 * recorrente quando o Google diz que é série.
 */
export function calendarEventDefaults(
  event: CalendarEvent,
  projects: Project[],
  categories: Category[],
  showWeekend: boolean
): CalendarEventDefaults {
  const hasRecurring = !!event.suggestedRecurringDays?.length || !!event.recurringEventId;
  const meta = parseCalendarMetadata(event.description);
  const matchedProject = findByNameCaseInsensitive(meta.projectName, projects);
  const matchedCategory = findByNameCaseInsensitive(meta.categoryName, categories);
  return {
    projectId: matchedProject?.id ?? null,
    projectName: matchedProject?.name ?? "",
    categoryId: matchedCategory?.id ?? null,
    categoryName: matchedCategory?.name ?? "",
    scheduleType: hasRecurring ? "recurring" : "specific_date",
    recurringDays: onlyVisibleDays(event.suggestedRecurringDays ?? [], showWeekend),
  };
}

/**
 * A lista do "Importar eventos": os eventos do período, cada um com a sugestão,
 * os sinais "já existe" e "ignorado" e se vem marcado.
 */
export async function loadCalendarImportCandidates(
  importer: ICalendarImporter,
  plannedRepo: IPlannedTaskRepository,
  params: LoadCalendarImportCandidatesParams
): Promise<CalendarImportCandidate[]> {
  const { fromDay, toDay, workspaceId, showWeekend, ignoreRules, projects, categories } = params;
  const fromISO = new Date(fromDay + "T00:00:00").toISOString();
  const toISO = new Date(toDay + "T23:59:59").toISOString();
  // A duplicata é procurada no workspace **de destino** do import, não em
  // todos: sem o escopo, evento já importado noutro workspace vinha marcado
  // "já existe" e desmarcado aqui, onde ele ainda não foi importado.
  //
  // O `findForWeek` recebe **dia**, não instante, e é o que todos os outros
  // chamadores passam: ele compara com `schedule_date`, que é "AAAA-MM-DD" no
  // banco. Passando o instante, o SQLite comparava `"2026-08-03"` com
  // `"2026-08-03T03:00:00.000Z"` como texto — o mais curto é prefixo do outro,
  // logo **menor** —, e a planejada do **primeiro dia do intervalo** ficava de
  // fora da busca. Na prática, o evento da segunda-feira nunca era marcado
  // "já existe", vinha selecionado e era importado de novo a cada import.
  const [allEvents, existingTasks] = await Promise.all([
    importer.getEvents(fromISO, toISO),
    plannedRepo.findForWeek(fromDay, toDay, workspaceId),
  ]);

  // Com o fim de semana desligado ele é descartado aqui, na origem, e não só na
  // renderização dos dias: escondido mas presente na lista, o evento de sábado
  // continuava selecionado por padrão, entrava na contagem do botão e era
  // importado — virando planejada sem dia onde aparecer.
  const events = showWeekend ? allEvents : allEvents.filter((e) => !isWeekend(e.date));
  const existingNames = new Set(existingTasks.map((t) => nameKey(t.name)));

  return events.map((event) => {
    const alreadyExists = existingNames.has(nameKey(event.title));
    const ignored = isEventIgnored(event.title, ignoreRules);
    return {
      event,
      defaults: calendarEventDefaults(event, projects, categories, showWeekend),
      alreadyExists,
      ignored,
      preselected: !alreadyExists && !ignored,
    };
  });
}
