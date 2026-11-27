import {
  MONDAY_CATALOG_EMPTY_HINT,
  type MondayCatalogFieldName,
} from "@domain/usecases/monday/mondayCatalogFields";
import { CLOCKIFY_ENTRIES_NOT_CONFIGURED } from "@presentation/integrations/entriesSources";
import type { AutoSyncNowIntegration } from "@presentation/settings/integrationSettingsPort";
import { DomainError } from "@shared/errors";
import type { CalendarIgnoreRule } from "@shared/types/calendarConfig";
import { ConflictError, NotFoundError, errorResult } from "../errors";
import { importBody } from "../importInput";
import type { LocalApiDeps, LocalApiHandler } from "../types";
import {
  CLOCKIFY_NOT_CONNECTED,
  GOOGLE_NOT_CONNECTED,
  MONDAY_NOT_CONNECTED,
  assertConnected,
} from "./integrationSettings";

/**
 * As ações da tela de Integrações que não são um campo (Fase D3b): as regras de
 * ignorar da Agenda, um item por vez como a lista da tela; as listas, os
 * vínculos e os imports do Clockify; os dois botões dos campos de catálogo e o
 * quadro digitado à mão do Monday; e o "Enviar agora" do envio diário.
 */

// ---------------- Google Agenda: eventos ignorados ----------------

function ignoreRule(body: unknown): CalendarIgnoreRule {
  const input = importBody(body);
  const { operator, value } = input;
  if (operator !== "equals" && operator !== "contains") {
    throw new DomainError("operator deve ser equals ou contains.");
  }
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainError("value deve ser o nome do evento (texto não vazio).");
  }
  return { operator, value };
}

/** "Adicionar" da lista, e o "Ignorar sempre" do import (`equals` com o título). */
export const addCalendarIgnoreRule: LocalApiHandler = async (deps, params) => {
  const rule = ignoreRule(params.body);
  const port = deps.integrationSettings;
  assertConnected(port.calendar().connected, GOOGLE_NOT_CONNECTED);
  const { added, rules } = await port.addCalendarIgnoreRule(rule);
  return { status: added ? 201 : 200, body: { added, ignoreRules: rules } };
};

export const removeCalendarIgnoreRule: LocalApiHandler = async (deps, params) => {
  const rule = ignoreRule(params.body);
  const port = deps.integrationSettings;
  assertConnected(port.calendar().connected, GOOGLE_NOT_CONNECTED);
  const { removed, rules } = await port.removeCalendarIgnoreRule(rule);
  if (!removed) throw new NotFoundError(`Nenhuma regra '${rule.operator}' para '${rule.value}'`);
  return { status: 200, body: { ignoreRules: rules } };
};

// ---------------- Clockify ----------------

/** Os vínculos e listas pedem o workspace do Clockify, como a seção Mapeamentos. */
function assertClockifyConfigured(deps: LocalApiDeps) {
  const settings = deps.integrationSettings.clockify();
  assertConnected(settings.connected, CLOCKIFY_NOT_CONNECTED);
  if (!settings.clockifyWorkspaceId) throw new ConflictError(CLOCKIFY_ENTRIES_NOT_CONFIGURED);
}

export const listClockifyWorkspaces: LocalApiHandler = async (deps) => {
  assertConnected(deps.integrationSettings.clockify().connected, CLOCKIFY_NOT_CONNECTED);
  return {
    status: 200,
    body: { workspaces: await deps.integrationSettings.refreshClockifyWorkspaces() },
  };
};

export const getClockifyCatalog: LocalApiHandler = async (deps) => {
  assertClockifyConfigured(deps);
  return { status: 200, body: await deps.integrationSettings.clockifyCatalog() };
};

function tagIdsOf(body: unknown): string[] {
  const { tagIds } = importBody(body);
  if (!Array.isArray(tagIds) || !tagIds.every((id) => typeof id === "string")) {
    throw new DomainError("tagIds deve ser uma lista de ids de tag do Clockify ([] = nenhuma).");
  }
  return [...new Set(tagIds as string[])];
}

async function assertTags(deps: LocalApiDeps, tagIds: string[]) {
  if (tagIds.length === 0) return;
  const known = new Set((await deps.integrationSettings.clockifyCatalog()).tags.map((t) => t.id));
  const missing = tagIds.filter((id) => !known.has(id));
  if (missing.length > 0) {
    throw new ConflictError(`Tag(s) do Clockify não encontrada(s): ${missing.join(", ")}`);
  }
}

export const setClockifyProjectMapping: LocalApiHandler = async (deps, params) => {
  assertClockifyConfigured(deps);
  const { clockifyProjectId } = importBody(params.body);
  if (typeof clockifyProjectId !== "string" || !clockifyProjectId) {
    throw new DomainError("clockifyProjectId deve ser o id de um projeto do Clockify.");
  }
  if (!(await deps.projectRepo.findAll()).some((p) => p.id === params.id)) {
    throw new NotFoundError(`Projeto '${params.id}' não encontrado`);
  }
  const port = deps.integrationSettings;
  const project = (await port.clockifyCatalog()).projects.find((p) => p.id === clockifyProjectId);
  if (!project) {
    throw new ConflictError(`Projeto do Clockify '${clockifyProjectId}' não encontrado`);
  }
  await port.setClockifyProjectMapping(params.id ?? "", project);
  return { status: 200, body: port.clockify() };
};

export const removeClockifyProjectMapping: LocalApiHandler = async (deps, params) => {
  assertClockifyConfigured(deps);
  const port = deps.integrationSettings;
  if (!port.clockify().projectMappings.some((m) => m.projectId === params.id)) {
    throw new NotFoundError(`Projeto '${params.id}' sem vínculo no workspace do Clockify`);
  }
  await port.setClockifyProjectMapping(params.id ?? "", null);
  return { status: 204, body: null };
};

export const setClockifyCategoryTags: LocalApiHandler = async (deps, params) => {
  assertClockifyConfigured(deps);
  const tagIds = tagIdsOf(params.body);
  if (!(await deps.categoryRepo.findAll()).some((c) => c.id === params.id)) {
    throw new NotFoundError(`Categoria '${params.id}' não encontrada`);
  }
  await assertTags(deps, tagIds);
  await deps.integrationSettings.setClockifyCategoryTags(params.id ?? "", tagIds);
  return { status: 200, body: deps.integrationSettings.clockify() };
};

export const setClockifyDefaultTags: LocalApiHandler = async (deps, params) => {
  assertClockifyConfigured(deps);
  const tagIds = tagIdsOf(params.body);
  await assertTags(deps, tagIds);
  await deps.integrationSettings.setClockifyDefaultTags(tagIds);
  return { status: 200, body: deps.integrationSettings.clockify() };
};

export const importClockifyProjects: LocalApiHandler = async (deps) => {
  assertClockifyConfigured(deps);
  const fetched = await deps.integrationSettings.importClockifyProjects();
  return {
    status: 200,
    body: { fetched, projectMappings: deps.integrationSettings.clockify().projectMappings },
  };
};

export const importClockifyTags: LocalApiHandler = async (deps) => {
  assertClockifyConfigured(deps);
  const fetched = await deps.integrationSettings.importClockifyTags();
  return {
    status: 200,
    body: { fetched, categoryMappings: deps.integrationSettings.clockify().categoryMappings },
  };
};

// ---------------- Monday ----------------

const CATALOG_FIELD_BY_PATH: Record<string, MondayCatalogFieldName> = {
  project_stage: "projectStage",
  non_billable_reason: "nonBillableReason",
};

function catalogFieldName(id: string | undefined): MondayCatalogFieldName {
  const name = id ? CATALOG_FIELD_BY_PATH[id] : undefined;
  if (!name) throw new NotFoundError(`Campo de catálogo desconhecido: '${id}'`);
  return name;
}

/** "Criar do Monday": cria o campo com os rótulos do board, ou vincula o homônimo. */
export const createMondayCatalogField: LocalApiHandler = async (deps, params) => {
  const name = catalogFieldName(params.id);
  const port = deps.integrationSettings;
  const settings = await port.monday();
  assertConnected(settings.connected, MONDAY_NOT_CONNECTED);
  const state = settings.catalogFields[name];
  if (state.fieldLabel !== null) {
    throw new ConflictError(
      `Já há um campo vinculado ("${state.fieldLabel}"). Para trazer rótulos novos, atualize as opções dele.`
    );
  }
  if (state.catalogLabels === 0) throw new ConflictError(MONDAY_CATALOG_EMPTY_HINT);
  const { field, reused } = await port.createMondayCatalogField(name);
  return {
    status: reused ? 200 : 201,
    body: {
      fieldId: field.id,
      label: field.label,
      created: !reused,
      options: field.options.length,
    },
  };
};

/** "Atualizar (+N)": acrescenta ao campo vinculado os rótulos do board que faltam. */
export const refreshMondayCatalogField: LocalApiHandler = async (deps, params) => {
  const name = catalogFieldName(params.id);
  const port = deps.integrationSettings;
  const settings = await port.monday();
  assertConnected(settings.connected, MONDAY_NOT_CONNECTED);
  const state = settings.catalogFields[name];
  const field = (await port.customFields()).find((f) => f.id === state.fieldId);
  if (!field) {
    throw new ConflictError("Nenhum campo vinculado. Vincule um campo ou crie-o do Monday.");
  }
  if (state.catalogLabels === 0) throw new ConflictError(MONDAY_CATALOG_EMPTY_HINT);
  const added = await port.refreshMondayCatalogField(name, field);
  return { status: 200, body: { fieldId: field.id, added } };
};

/**
 * O "ID do quadro" de um projeto do Portfólio sem a coluna preenchida. Como na
 * tela, só para o projeto que ainda não tem quadro.
 */
export const setMondayProjectBoard: LocalApiHandler = async (deps, params) => {
  const { boardId } = importBody(params.body);
  if (typeof boardId !== "string" || !boardId.trim()) {
    throw new DomainError("boardId deve ser o id do board do projeto no Monday.");
  }
  const port = deps.integrationSettings;
  const settings = await port.monday();
  assertConnected(settings.connected, MONDAY_NOT_CONNECTED);
  const project = settings.projects.find((p) => p.portfolioItemId === params.id);
  if (!project) throw new NotFoundError(`Item do Portfólio '${params.id}' sem projeto vinculado`);
  if (project.boardId) {
    throw new ConflictError(
      `O projeto "${project.projectName}" já tem quadro (${project.boardId}); ele vem do Portfólio.`
    );
  }
  try {
    await port.setMondayProjectBoard(project.portfolioItemId, boardId.trim());
  } catch (error) {
    // Board que não serve de destino: o motivo do toast da tela.
    if (error instanceof DomainError) throw new ConflictError(error.message);
    throw error;
  }
  const updated = (await port.monday()).projects.find(
    (p) => p.portfolioItemId === project.portfolioItemId
  );
  return { status: 200, body: updated ?? project };
};

// ---------------- "Enviar agora" do envio diário ----------------

const SYNC_NOW_SUCCESS: Record<AutoSyncNowIntegration, (count: number) => string> = {
  google_sheets: (count) => `${count} tarefa(s) enviada(s) para o Sheets.`,
  monday: (count) => `${count} atividade(s) enviada(s) ao Monday.`,
};

/**
 * O botão só existe com o envio automático diário ligado, e só no Sheets e no
 * Monday — o card do Clockify não tem "Enviar agora". O clique não consulta o
 * gatilho: envia na hora.
 */
export const runAutoSyncNow: LocalApiHandler = async (deps, params) => {
  const id = params.id as AutoSyncNowIntegration;
  if (id !== "google_sheets" && id !== "monday") {
    throw new NotFoundError(`Integração sem "Enviar agora": '${params.id}'`);
  }
  const port = deps.integrationSettings;
  const settings = id === "monday" ? await port.monday() : port.sheets();
  assertConnected(
    settings.connected,
    id === "monday" ? MONDAY_NOT_CONNECTED : GOOGLE_NOT_CONNECTED
  );
  if (!settings.autoSyncEnabled || settings.autoSyncMode !== "daily") {
    throw new ConflictError(
      'O "Enviar agora" existe só com o envio automático ligado no modo diário.'
    );
  }
  if (id === "google_sheets" && !port.sheets().spreadsheetId) {
    throw new ConflictError("Configure o ID da planilha antes de enviar.");
  }
  const result = await port.runAutoSyncNow(id);
  if (!result) throw new ConflictError(`Integração ${id} indisponível.`);
  if (result.error) return errorResult(502, result.error.message);
  const message =
    result.count === 0
      ? (result.warning ?? "Tudo enviado — nenhuma tarefa nova encontrada.")
      : [SYNC_NOW_SUCCESS[id](result.count), result.warning].filter(Boolean).join(" ");
  return {
    status: 200,
    body: { count: result.count, warning: result.warning ?? null, message },
  };
};
