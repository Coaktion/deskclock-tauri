import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import { getCategories } from "@domain/usecases/categories/GetCategories";
import { activeCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { normalizeCustomValues } from "@domain/usecases/customFields/normalizeCustomValues";
import {
  importMondaySelection,
  loadMondayImportCandidates,
  mondayImportBoards,
  mondayImportWindow,
  rowsInWindow,
  MONDAY_IMPORT_PERIODS,
  type MondayImportPeriod,
  type MondayImportSelection,
} from "@domain/usecases/monday/manualMondayImport";
import {
  resolveItemDefaults,
  type MondayImportRow,
} from "@domain/usecases/monday/mondayImportRows";
import { nameKey } from "@domain/usecases/calendar/nameKey";
import { getProjects } from "@domain/usecases/projects/GetProjects";
import { DomainError } from "@shared/errors";
import { ConflictError } from "../errors";
import { loadCatalogNames, toPlannedTaskDto } from "../dto";
import {
  assertAllFound,
  assertConfigured,
  has,
  importBody,
  optionalBoolean,
  optionalString,
  overrideCategory,
  selectionList,
  type ImportBody,
} from "../importInput";
import type { LocalApiDeps, LocalApiHandler } from "../types";

// Import do Monday pela API local (`mcp.md` §7, Fase D1): os itens como
// planejadas (`MondayImportModal`) e os três botões da "Importação de dados"
// (Projetos, Catálogos, Categorias). A regra é a da tela, em
// `manualMondayImport.ts` e `mondayCatalogImports.ts`.

function mondaySource(deps: LocalApiDeps) {
  const source = deps.imports.monday();
  assertConfigured(source);
  return source;
}

function parsePeriod(value: unknown): MondayImportPeriod {
  if (value === undefined || value === null || value === "") return "week";
  if (MONDAY_IMPORT_PERIODS.includes(value as MondayImportPeriod)) {
    return value as MondayImportPeriod;
  }
  throw new DomainError(`period deve ser ${MONDAY_IMPORT_PERIODS.join(", ")}`);
}

/** O que o modal busca, com as mesmas frases dos estados vazios dele. */
async function loadItems(deps: LocalApiDeps) {
  const source = mondaySource(deps);
  const workspaceId = source.workspaceId;
  const [projects, categories, fields] = await Promise.all([
    getProjects(deps.projectRepo, workspaceId),
    getCategories(deps.categoryRepo, workspaceId),
    deps.customFieldRepo.findAll(),
  ]);
  const { mapped, available } = mondayImportBoards(source.mappings, projects);
  if (mapped.length === 0) {
    throw new ConflictError(
      "Nenhum board vinculado. Importe os projetos na tela de Integrações primeiro."
    );
  }
  if (available.length === 0) {
    throw new ConflictError(
      "Os boards vinculados apontam para projetos de outro workspace. Confira o workspace escolhido na integração ou importe os projetos nele."
    );
  }
  if (!source.personId) {
    throw new ConflictError(
      "Conecte o Monday novamente: falta o usuário da conta para filtrar os itens."
    );
  }
  const candidates = await loadMondayImportCandidates(
    {
      api: source.api,
      trackedRepo: deps.mondayImportedItemRepo,
      plannedRepo: deps.plannedTaskRepo,
    },
    {
      boards: available,
      projects,
      personId: source.personId,
      workspaceId,
      todayISO: deps.todayISO(),
    }
  );
  // Só o campo ativo, como o modal: arquivado ou ausente, a etapa some da linha.
  const stageField = activeCustomFields(fields).find((f) => f.id === source.stageFieldId) ?? null;
  return {
    workspaceId,
    categories,
    stageField,
    boards: available.length,
    unavailableBoards: mapped.length - available.length,
    ...candidates,
  };
}

function itemDto(
  row: MondayImportRow,
  categories: Category[],
  stageField: CustomField | null,
  existingNames: Set<string>,
  imported: Set<string>
) {
  const defaults = resolveItemDefaults(row, categories, stageField);
  return {
    id: row.item.id,
    name: row.item.name,
    boardId: row.item.boardId,
    url: row.item.url,
    projectId: row.project.id,
    projectName: row.project.name,
    period: row.period ? { start: row.period.startDayISO, end: row.period.endDayISO } : null,
    activityType: row.activityTypeLabel || null,
    projectStage: row.projectStageLabel || null,
    categoryId: defaults.categoryId,
    categoryName: defaults.categoryName || null,
    billable: defaults.billable,
    customValues: defaults.customValues,
    alreadyImported: imported.has(row.item.id),
    alreadyExists: existingNames.has(nameKey(row.item.name)),
  };
}

export const previewMondayImport: LocalApiHandler = async (deps, params) => {
  const period = parsePeriod(params.period);
  const loaded = await loadItems(deps);
  const window = mondayImportWindow(period, deps.todayISO(), deps.weekStartsOn());
  const rows = rowsInWindow(loaded.rows, window);
  return {
    status: 200,
    body: {
      integration: "monday",
      workspaceId: loaded.workspaceId,
      period,
      from: window.start,
      to: window.end,
      boards: loaded.boards,
      unavailableBoards: loaded.unavailableBoards,
      stageField: loaded.stageField
        ? { id: loaded.stageField.id, label: loaded.stageField.label }
        : null,
      items: rows.map((r) =>
        itemDto(r, loaded.categories, loaded.stageField, loaded.existingNames, loaded.imported)
      ),
    },
  };
};

function stageValues(
  item: ImportBody,
  stageField: CustomField | null,
  suggested: CustomValues
): CustomValues {
  if (!has(item, "projectStage")) return suggested;
  if (!stageField) {
    throw new ConflictError(
      "Project Stage não configurado: crie o campo personalizado a partir da coluna do board, em Integrações → Monday → Importação de dados."
    );
  }
  const label = optionalString(item, "projectStage") ?? "";
  return normalizeCustomValues({ [stageField.id]: label }, [stageField]);
}

async function selectionOf(
  deps: LocalApiDeps,
  loaded: Awaited<ReturnType<typeof loadItems>>,
  row: MondayImportRow,
  item: ImportBody
): Promise<MondayImportSelection> {
  const defaults = resolveItemDefaults(row, loaded.categories, loaded.stageField);
  const category = await overrideCategory(deps, loaded.workspaceId, item);
  // O billable acompanha a categoria escolhida (§6.2), como na linha da tela;
  // categoria limpa mantém o da sugestão.
  const chosen = category.changed
    ? loaded.categories.find((c) => c.id === category.categoryId)
    : undefined;
  return {
    row,
    categoryId: category.changed ? category.categoryId : defaults.categoryId,
    billable: chosen ? chosen.defaultBillable : defaults.billable,
    customValues: stageValues(item, loaded.stageField, defaults.customValues),
  };
}

export const importMondayItemsHandler: LocalApiHandler = async (deps, params) => {
  const body = importBody(params.body);
  const chosen = selectionList<string>(body, "items", "string");
  const addOpenUrlAction = optionalBoolean(body, "addOpenUrlAction", true);
  const loaded = await loadItems(deps);

  const byId = new Map(loaded.rows.map((r) => [r.item.id, r]));
  assertAllFound(
    chosen.map((c) => c.id),
    new Set(byId.keys()),
    "Itens não encontrados entre os seus, fora do grupo Activities, nos boards vinculados"
  );
  const again = chosen.filter((c) => loaded.imported.has(c.id)).map((c) => c.id);
  if (again.length > 0) {
    throw new ConflictError(`Itens que já têm planejada: ${again.join(", ")}`);
  }

  const selections: MondayImportSelection[] = [];
  for (const { id, item } of chosen) {
    selections.push(await selectionOf(deps, loaded, byId.get(id)!, item));
  }
  const planned = await importMondaySelection(
    { plannedRepo: deps.plannedTaskRepo, trackedRepo: deps.mondayImportedItemRepo },
    selections,
    { nowISO: deps.nowISO(), workspaceId: loaded.workspaceId, addOpenUrlAction }
  );
  if (planned.length > 0) await deps.notifyPlannedTasksChanged();

  const catalog = await loadCatalogNames(deps, loaded.workspaceId);
  return {
    status: 200,
    body: {
      workspaceId: loaded.workspaceId,
      created: planned.map((task, i) => ({
        itemId: selections[i].row.item.id,
        plannedTask: toPlannedTaskDto(task, catalog),
      })),
    },
  };
};

export const importMondayProjectsHandler: LocalApiHandler = async (deps) => {
  const source = mondaySource(deps);
  if (source.projectsBlocker) throw new ConflictError(source.projectsBlocker);
  const result = await source.importProjects();
  return {
    status: 200,
    body: {
      workspaceId: source.workspaceId,
      projects: result.mappings.length,
      withoutBoard: result.mappings.filter((m) => !m.mondayBoardId).length,
      skipped: result.skipped,
      ignored: result.ignored,
      seededCategories: result.seeded,
    },
  };
};

export const importMondayCategoriesHandler: LocalApiHandler = async (deps) => {
  const source = mondaySource(deps);
  if (source.categoriesBlocker) throw new ConflictError(source.categoriesBlocker);
  const { created, existing } = await source.importCategories();
  return { status: 200, body: { workspaceId: source.workspaceId, created, existing } };
};

export const readMondayCatalogsHandler: LocalApiHandler = async (deps) => {
  const source = mondaySource(deps);
  if (source.catalogsBlocker) throw new ConflictError(source.catalogsBlocker);
  const catalogs = await source.readCatalogs();
  return { status: 200, body: catalogs };
};
