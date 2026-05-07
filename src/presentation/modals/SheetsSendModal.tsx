import { useMemo } from "react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { Task } from "@domain/entities/Task";
import type { TaskField } from "@shared/types/sheetsConfig";
import { NULLABLE_FIELDS } from "@shared/types/sheetsConfig";
import { validateTaskForSheets } from "@domain/integrations/taskValidation";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { TaskSendModal, type TaskSendAdapter } from "./TaskSendModal";

interface SheetsSendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function SheetsSendModal({ projects, categories, onClose }: SheetsSendModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();

  const adapter = useMemo<TaskSendAdapter>(() => {
    const spreadsheetId = config.isLoaded
      ? config.get("integrationGoogleSheetsSpreadsheetId")
      : null;
    const refreshToken = config.isLoaded ? config.get("googleRefreshToken") : null;
    const sender =
      spreadsheetId && refreshToken
        ? factories.createSheetsTaskSender({ spreadsheetId, projects, categories })
        : null;

    return {
      integrationId: "google_sheets",
      title: "Enviar para Google Sheets",
      sender,
      validateTask: validateTaskForSheets,
      validateBeforeSend: (tasks: Task[]) => {
        if (!config.isLoaded) return null;
        const mapping = config.get("integrationGoogleSheetsColumnMapping");
        const enabledFields = mapping.filter((c) => c.enabled).map((c) => c.field) as TaskField[];
        const requiredNullable = NULLABLE_FIELDS.filter((f) => enabledFields.includes(f));
        if (requiredNullable.length === 0) return null;

        const fieldLabel: Record<TaskField, string> = {
          date: "data",
          name: "nome",
          project: "projeto",
          category: "categoria",
          billable: "billable",
          startTime: "início",
          endTime: "fim",
          duration: "duração",
        };

        const incomplete: string[] = [];
        for (const task of tasks) {
          const missing: string[] = [];
          if (requiredNullable.includes("name") && !task.name?.trim()) missing.push(fieldLabel.name);
          if (requiredNullable.includes("project") && !task.projectId) missing.push(fieldLabel.project);
          if (requiredNullable.includes("category") && !task.categoryId) missing.push(fieldLabel.category);
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded, projects, categories]);

  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
