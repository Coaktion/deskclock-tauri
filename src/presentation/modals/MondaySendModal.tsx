import { useMemo } from "react";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { validateTaskForMonday } from "@domain/integrations/taskValidation";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { TaskSendModal, type TaskSendAdapter } from "./TaskSendModal";

interface MondaySendModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

export function MondaySendModal({ projects, categories, onClose }: MondaySendModalProps) {
  const config = useAppConfig();
  const factories = useIntegrations();

  const adapter = useMemo<TaskSendAdapter>(() => {
    const apiKey = config.isLoaded ? config.get("mondayApiKey") : null;
    const workspaceId = config.isLoaded ? config.get("mondayActiveWorkspaceId") : null;
    const sender = apiKey && workspaceId ? factories.createMondayTaskSender() : null;
    const mappedProjectIds = new Set(
      (config.isLoaded ? config.get("mondayProjectMapping") : [])
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => m.deskclockProjectId)
    );

    return {
      integrationId: "monday",
      title: "Enviar para Monday",
      sender,
      validateTask: validateTaskForMonday,
      // Sem board mapeado não há onde criar a atividade.
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
      resendWarning:
        "Uma ou mais tarefas selecionadas já foram enviadas. O reenvio atualiza a atividade " +
        "já criada no Monday, sem duplicar.",
    };
    // `config` e `factories` mudam de identidade a cada set(); recriar o adapter
    // a cada render remontaria a seleção do TaskSendModal no meio do envio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded, projects]);

  return (
    <TaskSendModal
      adapter={adapter}
      projects={projects}
      categories={categories}
      onClose={onClose}
    />
  );
}
