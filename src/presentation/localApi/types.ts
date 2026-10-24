import type { WeekStart } from "@shared/types/appConfig";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type {
  TaskSendAdapter,
  TaskSendCatalogs,
  TaskSendIntegrationId,
} from "@presentation/integrations/taskSendAdapters";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { ITrackedMondayItemRepository } from "@domain/integrations/ITrackedMondayItemRepository";
import type { IMondayActivityItemRepository } from "@domain/repositories/IMondayActivityItemRepository";
import type {
  CalendarImportSource,
  MondayImportSource,
  ZendeskImportSource,
} from "@presentation/integrations/importSources";
import type { IDaySummaryRepository } from "@domain/repositories/IDaySummaryRepository";
import type { DaySummarySource } from "@presentation/integrations/daySummaries";
import type { DriveBackupSource } from "@presentation/integrations/driveBackup";
import type {
  ClockifyEntriesSource,
  MondayEntriesSource,
} from "@presentation/integrations/entriesSources";
import type { SettingsPort } from "@presentation/settings/settingsGroups";
import type { IntegrationSettingsPort } from "@presentation/settings/integrationSettingsPort";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";
import type { WorkspaceContextValue } from "@presentation/contexts/WorkspaceContext";
import type { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";

/** O que o Rust manda em `local-api:request`. Cada op usa só o que precisa. */
export interface LocalApiParams {
  id?: string;
  date?: string | null;
  workspaceId?: string | null;
  from?: string | null;
  to?: string | null;
  name?: string | null;
  projectId?: string | null;
  categoryId?: string | null;
  billable?: string | null;
  /**
   * Recorte do Monday: no import, `today`, `week` ou `next30`; nas atividades,
   * `today`, `7days`, `30days` ou `month`.
   */
  period?: string | null;
  /** Filtro de tags padrão dos apontamentos do Clockify, em texto (`true`/`false`). */
  onlyDefaultTags?: string | null;
  body?: unknown;
}

export interface LocalApiResult {
  status: number;
  body: unknown;
}

export type RunningTaskOps = Pick<
  RunningTaskContextValue,
  | "runningTask"
  | "startTask"
  | "switchToTask"
  | "pauseTask"
  | "resumeTask"
  | "stopTask"
  | "cancelTask"
  | "updateActiveTask"
>;

/**
 * As mutações de workspace da UI. Vêm dos hooks, e não dos use cases, porque
 * a recarga da lista, o `WORKSPACE_CHANGED` e a troca do ativo quando ele é
 * excluído moram lá.
 */
export type WorkspaceOps = Pick<
  ReturnType<typeof useWorkspaceAdmin>,
  "create" | "update" | "remove"
> &
  Pick<WorkspaceContextValue, "switchTo">;

/**
 * O envio manual às integrações, como o modal o monta (`taskSendAdapters.ts`).
 * Porta estreita: a ponte não recebe a config nem as fábricas inteiras.
 */
export interface TaskSendPort {
  workspaceIdFor(integration: TaskSendIntegrationId): string;
  adapterFor(integration: TaskSendIntegrationId, catalogs: TaskSendCatalogs): TaskSendAdapter;
}

/**
 * Os imports das integrações, como os modais e os cards os montam
 * (`importSources.ts`). Porta estreita, como a do envio: uma fonte por
 * integração, montada na hora da requisição.
 */
export interface IntegrationImportPort {
  calendar(): CalendarImportSource;
  zendesk(): ZendeskImportSource;
  monday(): MondayImportSource;
}

/**
 * Os lançamentos no Clockify e no Monday, como os modais os buscam e gravam
 * (`entriesSources.ts`). Porta estreita, montada na hora.
 */
export interface IntegrationEntriesPort {
  clockify(): ClockifyEntriesSource;
  monday(): MondayEntriesSource;
}

/**
 * Retrato do app no instante em que a requisição começa. É montado a cada
 * render: as operações do contexto fecham sobre a tarefa em execução daquele
 * render, e um retrato velho pausaria uma tarefa que já foi parada.
 */
export interface LocalApiDeps {
  taskRepo: ITaskRepository;
  plannedTaskRepo: IPlannedTaskRepository;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
  workspaceRepo: IWorkspaceRepository;
  projectCategoryRepo: IProjectCategoryRepository;
  customFieldRepo: ICustomFieldRepository;
  taskLogRepo: ITaskIntegrationLogRepository;
  exportProfileRepo: IExportProfileRepository;
  taskSend: TaskSendPort;
  trackedMeetingRepo: ITrackedMeetingRepository;
  mondayImportedItemRepo: ITrackedMondayItemRepository;
  imports: IntegrationImportPort;
  daySummaryRepo: IDaySummaryRepository;
  /** O provedor de IA do resumo do dia — sem a chave, que fica na fábrica. */
  llm: () => DaySummarySource;
  driveBackup: () => DriveBackupSource;
  entries: IntegrationEntriesPort;
  /** O rastreio dos itens enviados ao Monday, que a exclusão de atividade limpa. */
  mondayActivityItemRepo: Pick<IMondayActivityItemRepository, "deleteItem">;
  /**
   * Configurações por grupo (Geral, Overlay, Acessibilidade, Atalhos), com os
   * efeitos das abas. Porta estreita: a ponte não recebe a config inteira.
   */
  settings: SettingsPort;
  /**
   * Os ajustes não secretos de cada integração e as ações da tela de
   * Integrações (Fase D3b). Porta estreita: nada de chave, token nem cache.
   */
  integrationSettings: IntegrationSettingsPort;
  activeWorkspaceId: string;
  running: RunningTaskOps;
  workspaces: WorkspaceOps;
  notifyTasksChanged: () => Promise<void>;
  notifyPlannedTasksChanged: () => Promise<void>;
  notifyProjectsChanged: () => Promise<void>;
  notifyCategoriesChanged: () => Promise<void>;
  notifyProjectCategoriesChanged: () => Promise<void>;
  notifyCustomFieldsChanged: () => Promise<void>;
  nowISO: () => string;
  todayISO: () => string;
  /**
   * Primeiro dia da semana — o mesmo das telas. É função, e não valor, pelo
   * mesmo motivo do `todayISO`: o retrato é do commit, e quem trocou a config
   * em Configurações não faz a ponte recomitar.
   */
  weekStartsOn: () => WeekStart;
}

export type LocalApiHandler = (
  deps: LocalApiDeps,
  params: LocalApiParams
) => Promise<LocalApiResult>;
