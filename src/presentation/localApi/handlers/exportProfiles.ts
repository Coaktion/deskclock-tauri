import type {
  CsvSeparator,
  DateFormat,
  DurationFormat,
  ExportColumn,
  ExportFormat,
  ExportProfile,
} from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import type { CustomField } from "@domain/entities/CustomField";
import { getExportProfiles } from "@domain/usecases/exportProfiles/GetExportProfiles";
import { createExportProfile } from "@domain/usecases/exportProfiles/CreateExportProfile";
import { updateExportProfile } from "@domain/usecases/exportProfiles/UpdateExportProfile";
import { deleteExportProfile } from "@domain/usecases/exportProfiles/DeleteExportProfile";
import { setDefaultExportProfile } from "@domain/usecases/exportProfiles/SetDefaultExportProfile";
import {
  generateTaskExport,
  loadTasksForExport,
  mergeTasksForExport,
  resolveExportProfile,
} from "@domain/usecases/exportProfiles/GenerateTaskExport";
import { activeCustomFields, getCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { CUSTOM_COLUMN_PREFIX, withCustomColumns } from "@domain/utils/exportFormatter";
import { DomainError } from "@shared/errors";
import { ConflictError, NotFoundError } from "../errors";
import { resolveRequestWorkspace } from "../resolve";
import { periodRange } from "../period";
import type { LocalApiDeps, LocalApiHandler } from "../types";

interface ProfileBody {
  workspaceId?: string | null;
  name?: string | null;
  isDefault?: boolean | null;
  format?: string | null;
  separator?: string | null;
  durationFormat?: string | null;
  dateFormat?: string | null;
  columns?: unknown;
}

interface GenerateBody {
  workspaceId?: string | null;
  profileId?: string | null;
  from?: string | null;
  to?: string | null;
  taskIds?: unknown;
}

const FORMATS: ExportFormat[] = ["csv", "json"];
const SEPARATORS: CsvSeparator[] = ["comma", "semicolon"];
const DURATION_FORMATS: DurationFormat[] = ["hh:mm:ss", "decimal", "minutes"];
const DATE_FORMATS: DateFormat[] = ["iso", "dd/mm/yyyy"];
const SYSTEM_FIELDS = new Set(DEFAULT_COLUMNS.map((c) => c.field));

function oneOf<T extends string>(value: string, allowed: T[], field: string): T {
  if (!allowed.includes(value as T)) {
    throw new DomainError(`${field} inválido: '${value}'. Use ${allowed.join(", ")}`);
  }
  return value as T;
}

function optionalOneOf<T extends string>(
  value: string | null | undefined,
  allowed: T[],
  field: string
): T | undefined {
  return value === undefined || value === null ? undefined : oneOf(value, allowed, field);
}

// O formulário só salva com nome; o use case não checa.
function requireName(name: string | null | undefined): string {
  if (typeof name !== "string" || !name.trim()) {
    throw new DomainError("name é obrigatório");
  }
  return name;
}

function isColumn(value: unknown): value is ExportColumn {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.field === "string" &&
    typeof c.label === "string" &&
    typeof c.visible === "boolean" &&
    typeof c.order === "number"
  );
}

/**
 * As colunas que o formulário grava: campo de sistema ou `custom:<id>` de um
 * campo que existe, cada um uma vez. Os campos ativos que faltarem entram
 * invisíveis, como o formulário os acrescenta ao abrir.
 */
function parseColumns(value: unknown, fields: CustomField[]): ExportColumn[] {
  if (!Array.isArray(value) || !value.every(isColumn)) {
    throw new DomainError("columns deve ser uma lista de { field, label, visible, order }");
  }
  const fieldIds = new Set(fields.map((f) => f.id));
  const seen = new Set<string>();
  for (const { field } of value) {
    const known = field.startsWith(CUSTOM_COLUMN_PREFIX)
      ? fieldIds.has(field.slice(CUSTOM_COLUMN_PREFIX.length))
      : SYSTEM_FIELDS.has(field);
    if (!known) throw new DomainError(`Coluna desconhecida: '${field}'`);
    if (seen.has(field)) throw new DomainError(`Coluna repetida: '${field}'`);
    seen.add(field);
  }
  // `order` renumerado 0..n-1 na ordem pedida, como o arrastar do formulário regrava.
  const ordered = [...value]
    .sort((x, y) => x.order - y.order)
    .map(({ field, label, visible }, order) => ({ field, label, visible, order }));
  return withCustomColumns(ordered, activeCustomFields(fields));
}

function exportProfileDto(p: ExportProfile) {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    name: p.name,
    isDefault: p.isDefault,
    format: p.format,
    separator: p.separator,
    durationFormat: p.durationFormat,
    dateFormat: p.dateFormat,
    columns: p.columns,
  };
}

// Id de outro workspace é 404, como o catálogo: a rota é escopada.
async function findProfileInWorkspace(
  deps: LocalApiDeps,
  workspaceId: string,
  id: string | undefined
): Promise<ExportProfile> {
  const profile = (await getExportProfiles(deps.exportProfileRepo, workspaceId)).find(
    (p) => p.id === id
  );
  if (!profile) throw new NotFoundError(`Perfil de exportação '${id}' não encontrado no workspace`);
  return profile;
}

export const listExportProfiles: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const profiles = await getExportProfiles(deps.exportProfileRepo, workspaceId);
  return { status: 200, body: profiles.map(exportProfileDto) };
};

/** Ausente vale o que o formulário de perfil novo traz preenchido. */
export const createExportProfileHandler: LocalApiHandler = async (deps, params) => {
  const body = params.body as ProfileBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const fields = await getCustomFields(deps.customFieldRepo);
  const profile = await createExportProfile(deps.exportProfileRepo, {
    workspaceId,
    name: requireName(body.name),
    isDefault: body.isDefault ?? false,
    format: optionalOneOf(body.format, FORMATS, "format") ?? "csv",
    separator: optionalOneOf(body.separator, SEPARATORS, "separator") ?? "comma",
    durationFormat:
      optionalOneOf(body.durationFormat, DURATION_FORMATS, "durationFormat") ?? "hh:mm:ss",
    dateFormat: optionalOneOf(body.dateFormat, DATE_FORMATS, "dateFormat") ?? "iso",
    columns: parseColumns(body.columns ?? [...DEFAULT_COLUMNS], fields),
  });
  return { status: 201, body: exportProfileDto(profile) };
};

export const updateExportProfileHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findProfileInWorkspace(deps, workspaceId, params.id);
  const body = (params.body ?? {}) as ProfileBody;
  const columns =
    body.columns === undefined || body.columns === null
      ? undefined
      : parseColumns(body.columns, await getCustomFields(deps.customFieldRepo));
  const patch = {
    name: body.name === undefined || body.name === null ? undefined : requireName(body.name),
    isDefault: body.isDefault ?? undefined,
    format: optionalOneOf(body.format, FORMATS, "format"),
    separator: optionalOneOf(body.separator, SEPARATORS, "separator"),
    durationFormat: optionalOneOf(body.durationFormat, DURATION_FORMATS, "durationFormat"),
    dateFormat: optionalOneOf(body.dateFormat, DATE_FORMATS, "dateFormat"),
    columns,
  };
  // O use case espalha o patch sobre o perfil: chave com `undefined` apagaria o valor.
  const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  const updated = await updateExportProfile(deps.exportProfileRepo, existing.id, defined);
  return { status: 200, body: exportProfileDto(updated) };
};

export const deleteExportProfileHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findProfileInWorkspace(deps, workspaceId, params.id);
  // A tela desabilita a lixeira do último perfil; o use case não barra.
  const profiles = await getExportProfiles(deps.exportProfileRepo, workspaceId);
  if (profiles.length <= 1) {
    throw new ConflictError("O único perfil de exportação do workspace não pode ser excluído");
  }
  await deleteExportProfile(deps.exportProfileRepo, existing.id);
  return { status: 204, body: null };
};

export const setDefaultExportProfileHandler: LocalApiHandler = async (deps, params) => {
  const workspaceId = await resolveRequestWorkspace(deps, params.workspaceId);
  const existing = await findProfileInWorkspace(deps, workspaceId, params.id);
  await setDefaultExportProfile(deps.exportProfileRepo, existing.id);
  return { status: 200, body: exportProfileDto({ ...existing, isDefault: true }) };
};

function parseTaskIds(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === "string")) {
    throw new DomainError("taskIds deve ser uma lista não vazia de ids");
  }
  return value;
}

/**
 * O "Carregar tarefas" + seleção + "Salvar arquivo"/"Copiar" do modal, sem
 * gravar nada: devolve o texto e o nome sugerido.
 */
export const generateExportHandler: LocalApiHandler = async (deps, params) => {
  const body = (params.body ?? {}) as GenerateBody;
  const workspaceId = await resolveRequestWorkspace(deps, body.workspaceId);
  const taskIds = parseTaskIds(body.taskIds);
  const { from, to } = periodRange(deps, { from: body.from, to: body.to });
  const profiles = await getExportProfiles(deps.exportProfileRepo, workspaceId);
  const profile = body.profileId
    ? await findProfileInWorkspace(deps, workspaceId, body.profileId)
    : resolveExportProfile(profiles);
  if (!profile) throw new ConflictError("Nenhum perfil de exportação no workspace");

  const tasks = await loadTasksForExport(deps.taskRepo, { from, to, workspaceId });
  let selection = tasks;
  if (taskIds) {
    const known = new Set(tasks.map((t) => t.id));
    const outside = taskIds.filter((id) => !known.has(id));
    if (outside.length > 0) {
      throw new ConflictError(
        `Tarefas fora das concluídas do período no workspace: ${outside.join(", ")}`
      );
    }
    const wanted = new Set(taskIds);
    selection = tasks.filter((t) => wanted.has(t.id));
  }

  const [projects, categories, customFields] = await Promise.all([
    deps.projectRepo.findAll(workspaceId),
    deps.categoryRepo.findAll(workspaceId),
    getCustomFields(deps.customFieldRepo),
  ]);
  const result = generateTaskExport(mergeTasksForExport(selection), profile, {
    projects,
    categories,
    customFields,
  });
  return {
    status: 200,
    body: { ...result, profileId: profile.id, workspaceId, from, to },
  };
};
