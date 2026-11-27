import type { CustomField } from "@domain/entities/CustomField";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import { createCustomField } from "@domain/usecases/customFields/CreateCustomField";
import { getCustomFields } from "@domain/usecases/customFields/GetCustomFields";
import { updateCustomField } from "@domain/usecases/customFields/UpdateCustomField";
import {
  MONDAY_CATALOG_FIELD_KEYS,
  MONDAY_CATALOG_FIELD_TITLES,
  missingCatalogOptions,
  mondayCatalogFieldSource,
  type MondayCatalogFieldName,
} from "@domain/usecases/monday/mondayCatalogFields";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { MONDAY_AUTO_SYNC_KEYS } from "@presentation/integrations/autoSyncIntegrations";
import {
  createOrLinkCatalogField,
  refreshCatalogFieldOptions,
} from "@presentation/integrations/mondayCatalogFields";
import { runMondaySetProjectBoard } from "@presentation/integrations/mondayCatalogImports";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ConfigKey } from "@shared/types/appConfig";
import { EMPTY_FIELD_CATALOGS, type MondayProjectScope } from "@shared/types/mondayConfig";
import {
  readAutoSync,
  readWorkspace,
  writeAutoSync,
  writeWorkspace,
  type AutoSyncSettings,
  type IntegrationSettingsConfig,
} from "./integrationSettings";

// Os ajustes do Monday como a Importação de dados, os boards e os campos de
// catálogo os gravam (`docs-internal/specs/mcp.md` §7, Fase D3b).

export interface MondayCatalogFieldState {
  /** "" = nenhum campo vinculado. */
  fieldId: string;
  fieldLabel: string | null;
  /** Rótulos do board que semeiam o campo; 0 = catálogos não lidos. */
  catalogLabels: number;
  /** Quantos desses o campo vinculado ainda não tem como opção. */
  missingOptions: number;
}

export interface MondayProjectRef {
  projectId: string;
  projectName: string;
  portfolioItemId: string;
  /** "" = sem quadro: as horas do projeto não sobem. */
  boardId: string;
  scope: MondayProjectScope;
}

export interface MondaySettings extends AutoSyncSettings {
  connected: boolean;
  workspaceId: string;
  portfolioBoardId: string;
  reportBoardId: string;
  autoImportEnabled: boolean;
  projectStageFieldId: string;
  nonBillableReasonFieldId: string;
  catalogFields: Record<MondayCatalogFieldName, MondayCatalogFieldState>;
  /** Os projetos vinculados que existem no workspace da integração. */
  projects: MondayProjectRef[];
}

type MondayPlainKey =
  | "portfolioBoardId"
  | "reportBoardId"
  | "autoImportEnabled"
  | "projectStageFieldId"
  | "nonBillableReasonFieldId";

export type MondaySettingsPatch = Partial<
  Pick<MondaySettings, "workspaceId" | MondayPlainKey> & AutoSyncSettings
>;

/** Chave do patch → chave da config, sem efeito além de gravar. */
const MONDAY_CONFIG_KEYS: Record<MondayPlainKey, ConfigKey> = {
  portfolioBoardId: "mondayPortfolioBoardId",
  reportBoardId: "mondayReportBoardId",
  autoImportEnabled: "mondayAutoImportEnabled",
  projectStageFieldId: "mondayProjectStageFieldId",
  nonBillableReasonFieldId: "mondayNonBillableReasonFieldId",
};

/** Os dois ids de board são aparados, como o campo da tela no blur. */
const TRIMMED: ReadonlySet<MondayPlainKey> = new Set(["portfolioBoardId", "reportBoardId"]);

export interface MondaySettingsPort {
  monday(): Promise<MondaySettings>;
  updateMonday(patch: MondaySettingsPatch): Promise<MondaySettings>;
  /** Os campos personalizados como estão — para validar o vínculo. */
  customFields(): Promise<CustomField[]>;
  createMondayCatalogField(
    name: MondayCatalogFieldName
  ): Promise<{ field: CustomField; reused: boolean }>;
  refreshMondayCatalogField(name: MondayCatalogFieldName, field: CustomField): Promise<number>;
  setMondayProjectBoard(portfolioItemId: string, boardId: string): Promise<void>;
}

export interface MondaySettingsDeps {
  config: IntegrationSettingsConfig;
  factories: Pick<IntegrationFactories, "createMondayApi">;
  projectRepo: IProjectRepository;
  customFieldRepo: ICustomFieldRepository;
  notifyCustomFieldsChanged: () => Promise<void>;
  nowISO: () => string;
}

export function buildMondayPort(deps: MondaySettingsDeps): MondaySettingsPort {
  const { config } = deps;
  const mappings = () => normalizeProjectMappings(config.get("mondayProjectMapping"));
  const catalogSource = (name: MondayCatalogFieldName) =>
    mondayCatalogFieldSource(
      name,
      config.get("mondayFieldCatalogs") ?? EMPTY_FIELD_CATALOGS,
      mappings()
    );

  async function monday(): Promise<MondaySettings> {
    const workspaceId = readWorkspace(config, "mondayDeskclockWorkspaceId");
    const [projects, fields] = await Promise.all([
      deps.projectRepo.findAll(workspaceId),
      getCustomFields(deps.customFieldRepo),
    ]);
    const names = new Map(projects.map((p) => [p.id, p.name]));
    const fieldState = (name: MondayCatalogFieldName): MondayCatalogFieldState => {
      const fieldId = config.get(MONDAY_CATALOG_FIELD_KEYS[name]);
      const linked = fields.find((f) => f.id === fieldId);
      const { optionLabels } = catalogSource(name);
      return {
        fieldId,
        fieldLabel: linked?.label ?? null,
        catalogLabels: optionLabels.length,
        missingOptions: linked ? missingCatalogOptions(linked, optionLabels).length : 0,
      };
    };
    return {
      connected: !!config.get("mondayApiKey"),
      workspaceId,
      portfolioBoardId: config.get("mondayPortfolioBoardId"),
      reportBoardId: config.get("mondayReportBoardId"),
      autoImportEnabled: config.get("mondayAutoImportEnabled"),
      projectStageFieldId: config.get("mondayProjectStageFieldId"),
      nonBillableReasonFieldId: config.get("mondayNonBillableReasonFieldId"),
      catalogFields: {
        projectStage: fieldState("projectStage"),
        nonBillableReason: fieldState("nonBillableReason"),
      },
      // Como o card de Projetos: o vínculo sobrevive a apagar o projeto, e só
      // conta o que existe no destino.
      projects: mappings()
        .filter((m) => names.has(m.deskclockProjectId))
        .map((m) => ({
          projectId: m.deskclockProjectId,
          projectName: names.get(m.deskclockProjectId) ?? "",
          portfolioItemId: m.portfolioItemId,
          boardId: m.mondayBoardId,
          scope: m.scope,
        })),
      ...readAutoSync(config, MONDAY_AUTO_SYNC_KEYS),
    };
  }

  /** O que o `useCustomFields` faz ao criar ou editar: grava e avisa as janelas. */
  const fieldWrites = {
    createField: async (input: Parameters<typeof createCustomField>[1]) => {
      const field = await createCustomField(deps.customFieldRepo, input, deps.nowISO());
      await deps.notifyCustomFieldsChanged();
      return field;
    },
    updateField: async (id: string, input: Parameters<typeof updateCustomField>[2]) => {
      await updateCustomField(deps.customFieldRepo, id, input);
      await deps.notifyCustomFieldsChanged();
    },
  };

  return {
    monday,
    async updateMonday(patch) {
      await writeWorkspace(config, "mondayDeskclockWorkspaceId", patch.workspaceId);
      for (const [key, configKey] of Object.entries(MONDAY_CONFIG_KEYS) as [
        MondayPlainKey,
        ConfigKey,
      ][]) {
        const value = patch[key];
        if (value === undefined) continue;
        const stored = TRIMMED.has(key) && typeof value === "string" ? value.trim() : value;
        await config.set(configKey, stored as never);
      }
      await writeAutoSync(config, MONDAY_AUTO_SYNC_KEYS, patch);
      return monday();
    },
    customFields: () => getCustomFields(deps.customFieldRepo),
    async createMondayCatalogField(name) {
      const { field, reused } = await createOrLinkCatalogField(
        {
          fields: await getCustomFields(deps.customFieldRepo),
          ...fieldWrites,
          link: (id) => config.set(MONDAY_CATALOG_FIELD_KEYS[name], id),
        },
        { title: MONDAY_CATALOG_FIELD_TITLES[name], ...catalogSource(name) }
      );
      return { field, reused };
    },
    refreshMondayCatalogField: (name, field) =>
      refreshCatalogFieldOptions(fieldWrites, field, catalogSource(name).optionLabels),
    async setMondayProjectBoard(portfolioItemId, boardId) {
      await runMondaySetProjectBoard(
        { config, api: deps.factories.createMondayApi() },
        portfolioItemId,
        boardId,
        deps.nowISO()
      );
    },
  };
}
