import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import { clockifyMappingsFor } from "@domain/usecases/clockify/clockifyMappings";
import { CLOCKIFY_AUTO_SYNC_KEYS } from "@presentation/integrations/autoSyncIntegrations";
import {
  clockifyProjectRefs,
  clockifyTagRefs,
  refreshClockifyWorkspaces,
  runClockifyProjectsImport,
  runClockifyTagsImport,
  saveClockifyCategoryMapping,
  saveClockifyProjectMapping,
  selectClockifyWorkspace,
  type ClockifyRef,
} from "@presentation/integrations/clockifySettings";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ClockifyWorkspaceRef } from "@shared/types/clockifyConfig";
import {
  readAutoSync,
  readWorkspace,
  writeAutoSync,
  writeWorkspace,
  type AutoSyncSettings,
  type IntegrationSettingsConfig,
} from "./integrationSettings";

// Os ajustes do Clockify, que passam pelo serviço (listas para escolher e
// conferir), como as seções "Workspace Clockify" e "Mapeamentos" os gravam
// (`docs-internal/specs/mcp.md` §7, Fase D3b).

export interface ClockifySettings extends AutoSyncSettings {
  connected: boolean;
  workspaceId: string;
  /** Workspace **do Clockify** ("Workspace Clockify"). */
  clockifyWorkspaceId: string;
  clockifyWorkspaceName: string;
  defaultTagIds: string[];
  /** Os vínculos do workspace do Clockify escolhido, como a seção os lista. */
  projectMappings: { projectId: string; clockifyProjectId: string; clockifyProjectName: string }[];
  categoryMappings: { categoryId: string; tagIds: string[] }[];
}

export type ClockifySettingsPatch = Partial<
  Pick<ClockifySettings, "workspaceId" | "clockifyWorkspaceId"> & AutoSyncSettings
>;

export interface ClockifySettingsPort {
  clockify(): ClockifySettings;
  updateClockify(patch: ClockifySettingsPatch): Promise<ClockifySettings>;
  /** O cache que o seletor "Workspace Clockify" oferece. */
  clockifyCachedWorkspaces(): ClockifyWorkspaceRef[];
  /** "Atualizar lista": relê do Clockify e grava o cache. */
  refreshClockifyWorkspaces(): Promise<ClockifyWorkspaceRef[]>;
  /** Projetos (pelo nome exibido) e tags do workspace do Clockify escolhido. */
  clockifyCatalog(): Promise<{ projects: ClockifyRef[]; tags: ClockifyRef[] }>;
  setClockifyProjectMapping(projectId: string, clockifyProject: ClockifyRef | null): Promise<void>;
  setClockifyCategoryTags(categoryId: string, tagIds: string[]): Promise<void>;
  setClockifyDefaultTags(tagIds: string[]): Promise<void>;
  importClockifyProjects(): Promise<number>;
  importClockifyTags(): Promise<number>;
}

export interface ClockifySettingsDeps {
  config: IntegrationSettingsConfig;
  factories: Pick<IntegrationFactories, "createClockifyApi">;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
  notifyProjectsChanged: () => Promise<void>;
  notifyCategoriesChanged: () => Promise<void>;
}

function readClockify(config: IntegrationSettingsConfig): ClockifySettings {
  const clockifyWorkspaceId = config.get("clockifyActiveWorkspaceId");
  return {
    connected: !!config.get("clockifyApiKey"),
    workspaceId: readWorkspace(config, "clockifyDeskclockWorkspaceId"),
    clockifyWorkspaceId,
    clockifyWorkspaceName: config.get("clockifyActiveWorkspaceName"),
    defaultTagIds: config.get("clockifyDefaultTagIds"),
    projectMappings: clockifyMappingsFor(
      config.get("clockifyProjectMapping"),
      clockifyWorkspaceId
    ).map((m) => ({
      projectId: m.deskclockProjectId,
      clockifyProjectId: m.clockifyProjectId,
      clockifyProjectName: m.clockifyProjectName,
    })),
    categoryMappings: clockifyMappingsFor(
      config.get("clockifyCategoryMapping"),
      clockifyWorkspaceId
    ).map((m) => ({ categoryId: m.deskclockCategoryId, tagIds: m.clockifyTagIds })),
    ...readAutoSync(config, CLOCKIFY_AUTO_SYNC_KEYS),
  };
}

export function buildClockifyPort(deps: ClockifySettingsDeps): ClockifySettingsPort {
  const { config } = deps;
  const api = () => deps.factories.createClockifyApi();
  const clockifyWorkspaceId = () => config.get("clockifyActiveWorkspaceId");
  const importDeps = () => ({
    config,
    api: api(),
    clockifyWorkspaceId: clockifyWorkspaceId(),
    deskclockWorkspaceId: readWorkspace(config, "clockifyDeskclockWorkspaceId"),
  });

  return {
    clockify: () => readClockify(config),
    async updateClockify(patch) {
      await writeWorkspace(config, "clockifyDeskclockWorkspaceId", patch.workspaceId);
      if (patch.clockifyWorkspaceId !== undefined) {
        const workspace = config
          .get("clockifyWorkspaceCache")
          .find((w) => w.id === patch.clockifyWorkspaceId);
        if (workspace) await selectClockifyWorkspace(config, workspace);
      }
      await writeAutoSync(config, CLOCKIFY_AUTO_SYNC_KEYS, patch);
      return readClockify(config);
    },
    clockifyCachedWorkspaces: () => config.get("clockifyWorkspaceCache"),
    refreshClockifyWorkspaces: () => refreshClockifyWorkspaces(config, api()),
    async clockifyCatalog() {
      const client = api();
      const [projects, tags] = await Promise.all([
        client.listProjects(clockifyWorkspaceId()),
        client.listTags(clockifyWorkspaceId()),
      ]);
      return { projects: clockifyProjectRefs(projects), tags: clockifyTagRefs(tags) };
    },
    async setClockifyProjectMapping(projectId, clockifyProject) {
      await saveClockifyProjectMapping(config, clockifyWorkspaceId(), projectId, clockifyProject);
    },
    async setClockifyCategoryTags(categoryId, tagIds) {
      await saveClockifyCategoryMapping(config, clockifyWorkspaceId(), categoryId, tagIds);
    },
    setClockifyDefaultTags: (tagIds) => config.set("clockifyDefaultTagIds", tagIds),
    async importClockifyProjects() {
      const result = await runClockifyProjectsImport({
        ...importDeps(),
        projectRepo: deps.projectRepo,
        notifyProjectsChanged: deps.notifyProjectsChanged,
      });
      return result.fetched;
    },
    async importClockifyTags() {
      const result = await runClockifyTagsImport({
        ...importDeps(),
        categoryRepo: deps.categoryRepo,
        notifyCategoriesChanged: deps.notifyCategoriesChanged,
      });
      return result.fetched;
    },
  };
}
