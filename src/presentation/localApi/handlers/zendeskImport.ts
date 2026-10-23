import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";
import {
  importTickets,
  ticketImportDefaults,
  toImportTicketInput,
  type TicketImportDefaults,
} from "@domain/usecases/plannedTasks/ImportTickets";
import { DomainError } from "@shared/errors";
import {
  assertAllFound,
  assertConfigured,
  has,
  importBody,
  optionalBoolean,
  optionalString,
  overrideCategory,
  overrideProject,
  selectionList,
  type ImportBody,
} from "../importInput";
import { assertDate } from "../period";
import type { LocalApiDeps, LocalApiHandler } from "../types";

// "Importar tickets" do Zendesk pela API local (`mcp.md` §7, Fase D1). A regra
// é a do modal: `ticketImportDefaults` é a linha como ela abre, e
// `toImportTicketInput` + `importTickets` gravam. O modal não confere o que já
// foi importado — a API também não.

async function loadTickets(deps: LocalApiDeps) {
  const source = deps.imports.zendesk();
  assertConfigured(source);
  return { source, tickets: await source.importer.getTickets() };
}

export const previewZendeskImport: LocalApiHandler = async (deps) => {
  const { source, tickets } = await loadTickets(deps);
  const today = deps.todayISO();
  return {
    status: 200,
    body: {
      integration: "zendesk",
      workspaceId: source.workspaceId,
      tickets: tickets.map((ticket) => {
        const defaults = ticketImportDefaults(ticket, today);
        return {
          id: ticket.id,
          subject: ticket.subject,
          status: ticket.status,
          webUrl: ticket.webUrl,
          name: defaults.name,
          scheduleType: defaults.scheduleType,
          scheduleDate: defaults.scheduleDate,
          addOpenUrlAction: defaults.addOpenUrlAction,
        };
      }),
    },
  };
};

const SCHEDULE_TYPES = ["recurring", "specific_date"] as const;

async function editOf(
  deps: LocalApiDeps,
  workspaceId: string,
  item: ImportBody,
  defaults: TicketImportDefaults
): Promise<TicketImportDefaults> {
  const scheduleType = item.scheduleType ?? defaults.scheduleType;
  if (!SCHEDULE_TYPES.includes(scheduleType as (typeof SCHEDULE_TYPES)[number])) {
    throw new DomainError("scheduleType deve ser 'recurring' ou 'specific_date'");
  }
  const scheduleDate = optionalString(item, "scheduleDate") || defaults.scheduleDate;
  assertDate(scheduleDate, "scheduleDate");
  const project = await overrideProject(deps, workspaceId, item);
  const category = await overrideCategory(deps, workspaceId, item);
  return {
    // Em branco volta ao padrão, como na tela.
    name: has(item, "name") ? (optionalString(item, "name") ?? "").trim() : defaults.name,
    projectId: project.projectId,
    // Trocar o projeto na linha zera a categoria, como o autocomplete da tela.
    categoryId: category.changed ? category.categoryId : null,
    addOpenUrlAction: optionalBoolean(item, "addOpenUrlAction", defaults.addOpenUrlAction),
    scheduleType: scheduleType as TicketImportDefaults["scheduleType"],
    scheduleDate,
  };
}

export const importZendeskTicketsHandler: LocalApiHandler = async (deps, params) => {
  const body = importBody(params.body);
  const chosen = selectionList<number>(body, "tickets", "number");
  const { source, tickets } = await loadTickets(deps);

  const byId = new Map<number, ZendeskTicket>(tickets.map((t) => [t.id, t]));
  assertAllFound(
    chosen.map((c) => c.id),
    new Set(byId.keys()),
    "Tickets fora dos atribuídos a você em aberto"
  );

  const today = deps.todayISO();
  const inputs = [];
  for (const { id, item } of chosen) {
    const ticket = byId.get(id)!;
    const edit = await editOf(deps, source.workspaceId, item, ticketImportDefaults(ticket, today));
    inputs.push(toImportTicketInput(ticket, edit));
  }
  const count = await importTickets(
    deps.plannedTaskRepo,
    inputs,
    deps.nowISO(),
    source.workspaceId
  );
  if (count > 0) await deps.notifyPlannedTasksChanged();

  return {
    status: 200,
    body: {
      workspaceId: source.workspaceId,
      imported: count,
      ticketIds: inputs.map((i) => i.ticket.id),
    },
  };
};
