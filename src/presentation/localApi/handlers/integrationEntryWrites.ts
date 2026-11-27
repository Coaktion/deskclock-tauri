import {
  buildClockifyEntryPayload,
  clockifyEntryDraftError,
  clockifyProjectIdByName,
} from "@domain/usecases/clockify/clockifyEntryPayload";
import { loadMondayEntries, type MondayEntry } from "@domain/usecases/monday/mondayEntries";
import {
  deleteMondayEntry,
  mondayEntryPatchError,
  updateMondayEntry,
  type MondayEntryPatch,
} from "@domain/usecases/monday/mondayEntryWrite";
import type { ClockifyEntriesSource } from "@presentation/integrations/entriesSources";
import { DomainError } from "@shared/errors";
import type { ClockifyTimeEntryPayload } from "@shared/types/clockify";
import { ConflictError, NotFoundError } from "../errors";
import {
  assertConfigured,
  has,
  importBody,
  optionalBoolean,
  type ImportBody,
} from "../importInput";
import { assertDate } from "../period";
import type { LocalApiDeps, LocalApiHandler, LocalApiParams } from "../types";
import { mondayEntryDto } from "./integrationEntries";

// A escrita de "Apontamentos do Clockify" e "Atividades no Monday" pela API
// local (`mcp.md` §7, Fase D2b). As regras são as dos formulários dos modais
// (`clockifyEntryPayload.ts`, `mondayEntryWrite.ts`); o que é só daqui é ler o
// corpo, achar projeto e tags pelo nome e recusar o que a tela não deixa
// escolher.

const HHMM_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function requiredText(body: ImportBody, key: string): string {
  const value = body[key];
  if (typeof value !== "string") throw new DomainError(`${key} é obrigatório (texto)`);
  return value;
}

function requiredTime(body: ImportBody, key: string): string {
  const value = requiredText(body, key);
  if (!HHMM_PATTERN.test(value)) throw new DomainError(`${key} deve estar no formato HH:MM`);
  return value;
}

function optionalStringList(body: ImportBody, key: string): string[] | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new DomainError(`${key} deve ser uma lista de textos`);
  }
  return [...new Set(value as string[])];
}

function entryId(params: LocalApiParams): string {
  if (!params.id) throw new DomainError("id é obrigatório");
  return params.id;
}

/** O projeto como o campo da tela o aceita: um dos projetos do workspace do Clockify. */
async function resolveClockifyProject(
  source: ClockifyEntriesSource,
  body: ImportBody
): Promise<string | null> {
  const projectId = body.projectId;
  const projectName = body.projectName;
  if (projectId === undefined || projectId === null) {
    if (projectName === undefined || projectName === null) return null;
    if (typeof projectName !== "string") throw new DomainError("projectName deve ser texto");
  } else if (typeof projectId !== "string") {
    throw new DomainError("projectId deve ser texto");
  }
  const projects = await source.api.listProjects(source.workspaceId);
  if (typeof projectId === "string") {
    if (!projects.some((p) => p.id === projectId)) {
      throw new ConflictError(`Projeto '${projectId}' não encontrado no Clockify.`);
    }
    return projectId;
  }
  const found = clockifyProjectIdByName(projects, projectName as string);
  if (!found) throw new ConflictError(`Projeto '${projectName}' não encontrado no Clockify.`);
  return found;
}

/**
 * As tags, por id ou nome, entre as do workspace do Clockify. Ausentes: o
 * `fallback` (na criação, as tags padrão que o formulário traz marcadas).
 */
async function resolveClockifyTags(
  source: ClockifyEntriesSource,
  body: ImportBody,
  fallback: string[] | null
): Promise<string[]> {
  const tagIds = optionalStringList(body, "tagIds");
  const tagNames = tagIds ? undefined : optionalStringList(body, "tagNames");
  if (!tagIds && !tagNames) {
    if (fallback) return fallback;
    throw new DomainError(
      "tagIds ou tagNames é obrigatório na edição (lista vazia = sem tags): ela regrava o apontamento inteiro"
    );
  }
  const wanted = tagIds ?? tagNames ?? [];
  if (wanted.length === 0) return [];
  const tags = await source.api.listTags(source.workspaceId);
  return wanted.map((ref) => {
    const tag = tags.find((t) => (tagIds ? t.id === ref : t.name === ref));
    if (!tag) throw new ConflictError(`Tag '${ref}' não encontrada no Clockify.`);
    return tag.id;
  });
}

async function clockifyPayload(
  source: ClockifyEntriesSource,
  rawBody: unknown,
  mode: "create" | "update"
): Promise<ClockifyTimeEntryPayload> {
  const body = importBody(rawBody);
  const description = requiredText(body, "description");
  const dateISO = requiredText(body, "date");
  assertDate(dateISO, "date");
  const startHHMM = requiredTime(body, "start");
  const endHHMM = requiredTime(body, "end");
  if (mode === "update" && !has(body, "billable")) {
    throw new DomainError("billable é obrigatório na edição: ela regrava o apontamento inteiro");
  }
  // O formulário de criação abre com faturável desligado.
  const billable = optionalBoolean(body, "billable", false);
  const projectId = await resolveClockifyProject(source, body);
  const draft = { description, projectId, dateISO, startHHMM, endHHMM, billable, tagIds: [] };
  const error = clockifyEntryDraftError(draft);
  if (error) throw new DomainError(error);
  const tagIds = await resolveClockifyTags(
    source,
    body,
    mode === "create" ? source.defaultTagIds : null
  );
  return buildClockifyEntryPayload({ ...draft, tagIds });
}

/** O que foi gravado — o PUT do Clockify não devolve projeto nem tags hidratados. */
function writtenClockifyEntryDto(id: string, payload: ClockifyTimeEntryPayload) {
  return {
    id,
    description: payload.description,
    start: payload.start,
    end: payload.end,
    durationSeconds: Math.round(
      (new Date(payload.end).getTime() - new Date(payload.start).getTime()) / 1000
    ),
    billable: payload.billable,
    projectId: payload.projectId ?? null,
    tagIds: payload.tagIds ?? [],
  };
}

export const createClockifyEntry: LocalApiHandler = async (deps, params) => {
  const source = deps.entries.clockify();
  assertConfigured(source);
  const payload = await clockifyPayload(source, params.body, "create");
  const created = await source.api.createTimeEntry(source.workspaceId, payload);
  return { status: 201, body: writtenClockifyEntryDto(created.id, payload) };
};

export const updateClockifyEntry: LocalApiHandler = async (deps, params) => {
  const id = entryId(params);
  const source = deps.entries.clockify();
  assertConfigured(source);
  const payload = await clockifyPayload(source, params.body, "update");
  await source.api.updateTimeEntry(source.workspaceId, id, payload);
  return { status: 200, body: writtenClockifyEntryDto(id, payload) };
};

export const deleteClockifyEntry: LocalApiHandler = async (deps, params) => {
  const id = entryId(params);
  const source = deps.entries.clockify();
  assertConfigured(source);
  await source.api.deleteTimeEntry(source.workspaceId, id);
  return { status: 204, body: null };
};

/**
 * A atividade, entre as do usuário que a tela lista (mesma busca, mesmo piso):
 * a tela só edita e exclui o que mostra, e o board é do time inteiro.
 */
async function findOwnMondayEntry(deps: LocalApiDeps, itemId: string) {
  const source = deps.entries.monday();
  assertConfigured(source);
  const all = await loadMondayEntries(source.api, source.mappings, source.userId, deps.todayISO());
  const entry = all.find((e) => e.itemId === itemId);
  if (!entry) {
    throw new NotFoundError(
      `Atividade '${itemId}' não encontrada entre as suas nos boards vinculados.`
    );
  }
  return { source, entry };
}

function optionalNumber(body: ImportBody, key: string): number | undefined {
  const value = body[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number") throw new DomainError(`${key} deve ser um número`);
  return value;
}

function optionalText(body: ImportBody, key: string): string | null | undefined {
  const value = body[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new DomainError(`${key} deve ser texto`);
  return value;
}

interface MondayEntryBody {
  name?: string;
  hours?: number;
  billable?: boolean;
  /** `null` = a opção vazia do select. */
  activityType?: string | null;
  projectStage?: string | null;
}

/** Os tipos do corpo, antes de buscar no Monday. */
function parseMondayBody(rawBody: unknown): MondayEntryBody {
  const body = importBody(rawBody);
  const parsed: MondayEntryBody = {};
  const name = optionalText(body, "name");
  if (typeof name === "string") parsed.name = name;
  const hours = optionalNumber(body, "hours");
  if (hours !== undefined) parsed.hours = hours;
  if (body.billable !== undefined && body.billable !== null) {
    parsed.billable = optionalBoolean(body, "billable", false);
  }
  for (const key of ["activityType", "projectStage"] as const) {
    const value = optionalText(body, key);
    if (value !== undefined) parsed[key] = value === "" ? null : value;
  }
  return parsed;
}

/**
 * Rótulo do select. Ausente = o atual; `null` = a opção vazia do select, que
 * não escreve a coluna (o board mantém o valor). Rótulo que o select não
 * oferece é recusado — a tela não o deixa escolher.
 */
function mondayLabel(
  value: string | null | undefined,
  current: string,
  allowed: string[],
  field: string
): string {
  if (value === undefined) return current;
  if (value === null) return "";
  if (!allowed.includes(value)) {
    throw new DomainError(
      allowed.length === 0
        ? `Este board não tem ${field}.`
        : `${field} '${value}' não existe neste board. Opções: ${allowed.join(", ")}.`
    );
  }
  return value;
}

function mondayPatch(entry: MondayEntry, body: MondayEntryBody): MondayEntryPatch {
  const { mapping } = entry;
  // A tela só mostra o botão de faturável quando o board tem a coluna.
  if (body.billable !== undefined && !mapping.columnIds.billingType) {
    throw new DomainError("Este board não tem a coluna Billing type.");
  }
  return {
    name: body.name ?? entry.name,
    hoursDecimal: body.hours ?? entry.hoursDecimal,
    billable: body.billable ?? entry.billable,
    activityTypeLabel: mondayLabel(
      body.activityType,
      entry.activityTypeLabel,
      mapping.activityTypeLabels,
      "Activity Type"
    ),
    projectStageLabel: mondayLabel(
      body.projectStage,
      entry.projectStageLabel,
      mapping.projectStageLabels,
      "Project Stage"
    ),
  };
}

/** A atividade como ficou no board: coluna não escrita mantém o valor que tinha. */
function updatedMondayEntry(entry: MondayEntry, patch: MondayEntryPatch): MondayEntry {
  const { mapping } = entry;
  return {
    ...entry,
    name: patch.name.trim(),
    hoursDecimal: patch.hoursDecimal,
    billable: mapping.columnIds.billingType ? patch.billable : entry.billable,
    activityTypeLabel: mapping.activityTypeLabels.includes(patch.activityTypeLabel)
      ? patch.activityTypeLabel
      : entry.activityTypeLabel,
    projectStageLabel: mapping.projectStageLabels.includes(patch.projectStageLabel)
      ? patch.projectStageLabel
      : entry.projectStageLabel,
  };
}

export const updateMondayEntryHandler: LocalApiHandler = async (deps, params) => {
  const id = entryId(params);
  const body = parseMondayBody(params.body);
  const { source, entry } = await findOwnMondayEntry(deps, id);
  const patch = mondayPatch(entry, body);
  const error = mondayEntryPatchError(patch);
  if (error) throw new DomainError(error);
  await updateMondayEntry(source.api, entry, patch, source.userId);
  return { status: 200, body: mondayEntryDto(updatedMondayEntry(entry, patch)) };
};

export const deleteMondayEntryHandler: LocalApiHandler = async (deps, params) => {
  const { source, entry } = await findOwnMondayEntry(deps, entryId(params));
  await deleteMondayEntry(source.api, deps.mondayActivityItemRepo, entry);
  return { status: 204, body: null };
};
