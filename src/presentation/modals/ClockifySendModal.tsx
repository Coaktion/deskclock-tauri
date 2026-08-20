import { useMemo } from "react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { validateTaskForClockify } from "@domain/integrations/taskValidation";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { TaskSendModal, type TaskSendAdapter } from "./TaskSendModal";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";

interface ClockifySendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function ClockifySendModal({ projects, categories, onClose }: ClockifySendModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();

  const adapter = useMemo<TaskSendAdapter>(() => {
    const apiKey = config.isLoaded ? config.get("clockifyApiKey") : null;
    // Do Clockify, não do DeskClock — os dois convivem aqui.
    const clockifyWorkspaceId = config.isLoaded ? config.get("clockifyActiveWorkspaceId") : null;
    const sender = apiKey && clockifyWorkspaceId ? factories.createClockifyTaskSender() : null;

    return {
      integrationId: "clockify",
      workspaceId: resolveIntegrationWorkspaceId(
        config.isLoaded ? config.get("clockifyDeskclockWorkspaceId") : ""
      ),
      title: "Enviar para Clockify",
      sender,
      validateTask: validateTaskForClockify,
      onSendSuccess: async () => {
        await config.set("clockifyDailySyncLastTimestamp", new Date().toISOString());
      },
      notConfiguredMessage: "Clockify não configurado. Verifique API Key e workspace.",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded]);

  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
