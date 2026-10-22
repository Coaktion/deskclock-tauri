import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskValidationResult } from "@domain/integrations/taskValidation";
import {
  validateTaskForClockify,
  validateTaskForMonday,
  validateTaskForSheets,
} from "@domain/integrations/taskValidation";
import type { TaskSendTarget } from "@domain/usecases/tasks/SendTaskGroups";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { ConfigContextValue, IntegrationWorkspaceKey } from "@shared/types/appConfig";
import type { TaskField } from "@shared/types/sheetsConfig";
import { NULLABLE_FIELDS } from "@shared/types/sheetsConfig";

/** As integrações de envio manual, pela chave do log de envio — a mesma que a API local expõe. */
export const TASK_SEND_INTEGRATIONS = ["google_sheets", "clockify", "monday"] as const;
export type TaskSendIntegrationId = (typeof TASK_SEND_INTEGRATIONS)[number];

export function isTaskSendIntegration(value: unknown): value is TaskSendIntegrationId {
  return (TASK_SEND_INTEGRATIONS as readonly unknown[]).includes(value);
}

export interface TaskSendAdapter extends TaskSendTarget {
  /**
   * Workspace do DeskClock da integração — o recorte da lista de tarefas
   * (`resolveIntegrationWorkspaceId`).
   */
  workspaceId: string;
  /** Título exibido no header do modal. */
  title: string;
  /** Valida uma tarefa antes de exibi-la / selecioná-la. */
  validateTask: (task: Task) => TaskValidationResult;
  /** Mensagem de erro quando o sender é null. */
  notConfiguredMessage: string;
  /** Aviso exibido quando há tarefas já enviadas na seleção. */
  resendWarning: string;
}

/** Projetos e categorias do workspace da integração (`useIntegrationCatalogs`). */
export interface TaskSendCatalogs {
  projects: Project[];
  categories: Category[];
}

const DEFAULT_RESEND_WARNING =
  "Uma ou mais tarefas selecionadas já foram enviadas. O reenvio pode criar duplicatas.";

const WORKSPACE_KEY: Record<TaskSendIntegrationId, IntegrationWorkspaceKey> = {
  google_sheets: "sheetsDeskclockWorkspaceId",
  clockify: "clockifyDeskclockWorkspaceId",
  monday: "mondayDeskclockWorkspaceId",
};

export function taskSendWorkspaceId(
  integration: TaskSendIntegrationId,
  config: ConfigContextValue
): string {
  return resolveIntegrationWorkspaceId(
    config.isLoaded ? config.get(WORKSPACE_KEY[integration]) : ""
  );
}

type Builder = (
  config: ConfigContextValue,
  factories: IntegrationFactories,
  catalogs: TaskSendCatalogs
) => Omit<TaskSendAdapter, "integrationId" | "workspaceId">;

const SHEETS_FIELD_LABEL: Record<TaskField, string> = {
  date: "data",
  name: "nome",
  project: "projeto",
  category: "categoria",
  billable: "billable",
  startTime: "início",
  endTime: "fim",
  duration: "duração",
};

const buildSheets: Builder = (config, factories, { projects, categories }) => {
  const spreadsheetId = config.isLoaded ? config.get("integrationGoogleSheetsSpreadsheetId") : null;
  const refreshToken = config.isLoaded ? config.get("googleRefreshToken") : null;
  return {
    title: "Enviar para Google Sheets",
    sender:
      spreadsheetId && refreshToken
        ? factories.createSheetsTaskSender({ spreadsheetId, projects, categories })
        : null,
    validateTask: validateTaskForSheets,
    validateBeforeSend: (tasks: Task[]) => {
      if (!config.isLoaded) return null;
      const mapping = config.get("integrationGoogleSheetsColumnMapping");
      const enabledFields = mapping.filter((c) => c.enabled).map((c) => c.field) as TaskField[];
      const requiredNullable = NULLABLE_FIELDS.filter((f) => enabledFields.includes(f));
      if (requiredNullable.length === 0) return null;

      const incomplete: string[] = [];
      for (const task of tasks) {
        const missing: string[] = [];
        if (requiredNullable.includes("name") && !task.name?.trim())
          missing.push(SHEETS_FIELD_LABEL.name);
        if (requiredNullable.includes("project") && !task.projectId)
          missing.push(SHEETS_FIELD_LABEL.project);
        if (requiredNullable.includes("category") && !task.categoryId)
          missing.push(SHEETS_FIELD_LABEL.category);
        if (missing.length > 0) {
          incomplete.push(`"${task.name ?? "(sem nome)"}" — faltam: ${missing.join(", ")}`);
        }
      }
      return incomplete.length === 0 ? null : `Dados incompletos:\n${incomplete.join("\n")}`;
    },
    onSendSuccess: async () => {
      await config.set("sheetsDailySyncLastTimestamp", new Date().toISOString());
    },
    notConfiguredMessage: "Integração com Google Sheets não configurada.",
    resendWarning: DEFAULT_RESEND_WARNING,
  };
};

const buildClockify: Builder = (config, factories) => {
  const apiKey = config.isLoaded ? config.get("clockifyApiKey") : null;
  // Do Clockify, não do DeskClock — os dois convivem aqui.
  const clockifyWorkspaceId = config.isLoaded ? config.get("clockifyActiveWorkspaceId") : null;
  return {
    title: "Enviar para Clockify",
    sender: apiKey && clockifyWorkspaceId ? factories.createClockifyTaskSender() : null,
    validateTask: validateTaskForClockify,
    onSendSuccess: async () => {
      await config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
    },
    notConfiguredMessage: "Clockify não configurado. Verifique API Key e workspace.",
    resendWarning: DEFAULT_RESEND_WARNING,
  };
};

const buildMonday: Builder = (config, factories, { projects }) => {
  const apiKey = config.isLoaded ? config.get("mondayApiKey") : null;
  // Sem quadro de destino não há onde criar a atividade — o projeto existe no
  // Portfólio, mas a coluna "ID Quadro Projeto" ainda está vazia.
  const mappedProjectIds = new Set(
    (config.isLoaded ? config.get("mondayProjectMapping") : [])
      .filter((m) => !!m.mondayBoardId)
      .map((m) => m.deskclockProjectId)
  );
  return {
    title: "Enviar para Monday",
    // Envio manual escreve sempre: o usuário selecionou e mandou enviar, então o
    // "nada mudou desde a última vez" do auto-sync não vale aqui.
    sender: apiKey ? factories.createMondayTaskSender({ forceWrite: true }) : null,
    validateTask: validateTaskForMonday,
    validateBeforeSend: (tasks: Task[]) => {
      const unmapped = tasks.filter((t) => !t.projectId || !mappedProjectIds.has(t.projectId));
      if (unmapped.length === 0) return null;
      const names = [...new Set(unmapped.map((t) => t.projectId))]
        .map((id) => projects.find((p) => p.id === id)?.name ?? "sem projeto")
        .join(", ");
      return `Projeto(s) sem board mapeado no Monday: ${names}.`;
    },
    onSendSuccess: async () => {
      await config.set("mondayDailySyncLastTimestamp", new Date().toISOString());
    },
    notConfiguredMessage: "Monday não configurado. Verifique o token e o workspace.",
    // O sender unifica internamente e precisa de todos os ids do grupo para
    // reencontrar o item já criado no Monday.
    sendsRawTasks: true,
    // O aviso avisa, não impede: o envio segue com a seleção que está lá.
    resendWarning:
      "Uma ou mais tarefas selecionadas já foram enviadas. O reenvio reescreve a atividade " +
      "no Monday; se ela tiver sido apagada por lá, uma nova é criada — o que pode duplicar.",
  };
};

const BUILDERS: Record<TaskSendIntegrationId, Builder> = {
  google_sheets: buildSheets,
  clockify: buildClockify,
  monday: buildMonday,
};

/**
 * O adaptador de envio manual de uma integração, a partir da config e das
 * fábricas. Função pura (sem hook) porque a API local monta o mesmo adaptador
 * fora de componente — é o que garante que modal e API enviam igual.
 */
export function buildTaskSendAdapter(
  integration: TaskSendIntegrationId,
  config: ConfigContextValue,
  factories: IntegrationFactories,
  catalogs: TaskSendCatalogs
): TaskSendAdapter {
  return {
    integrationId: integration,
    workspaceId: taskSendWorkspaceId(integration, config),
    ...BUILDERS[integration](config, factories, catalogs),
  };
}
