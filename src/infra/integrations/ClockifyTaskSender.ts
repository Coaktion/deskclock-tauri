import type { Task } from "@domain/entities/Task";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { validateTaskForClockify } from "@domain/integrations/taskValidation";
import { ClockifyClient } from "./clockify/ClockifyClient";

export class ClockifyTaskSender implements ITaskSender {
  readonly integrationName = "Clockify";
  private client: ClockifyClient;

  constructor(
    private config: ConfigContextValue,
    client?: ClockifyClient
  ) {
    this.client = client ?? new ClockifyClient(config.get("clockifyApiKey"));
  }

  async send(tasks: Task[]): Promise<void> {
    const workspaceId = this.config.get("clockifyActiveWorkspaceId");
    if (!workspaceId) throw new Error("Nenhum workspace Clockify configurado.");

    const projectMapping = this.config.get("clockifyProjectMapping").filter(
      (m) => m.workspaceId === workspaceId
    );
    const categoryMapping = this.config.get("clockifyCategoryMapping").filter(
      (m) => m.workspaceId === workspaceId
    );
    const defaultTagIds = this.config.get("clockifyDefaultTagIds");

    const allCompleted = tasks.filter((t) => t.status === "completed" && t.endTime != null);
    const completedTasks = allCompleted.filter((t) => validateTaskForClockify(t).ok);

    if (completedTasks.length === 0 && allCompleted.length > 0) {
      throw new Error("Nenhuma tarefa válida para enviar ao Clockify (precisa de nome e projeto).");
    }

    for (const task of completedTasks) {
      const start = new Date(task.startTime);
      const durationSec = task.durationSeconds ?? 0;
      const end = new Date(start.getTime() + durationSec * 1000);

      const projectEntry = task.projectId
        ? projectMapping.find((m) => m.deskclockProjectId === task.projectId)
        : undefined;

      const categoryTagIds = task.categoryId
        ? (categoryMapping.find((m) => m.deskclockCategoryId === task.categoryId)?.clockifyTagIds ?? [])
        : [];

      const tagIds = Array.from(new Set([...defaultTagIds, ...categoryTagIds]));

      await this.client.createTimeEntry(workspaceId, {
        start: start.toISOString(),
        end: end.toISOString(),
        description: task.name!.trim(),
        ...(projectEntry ? { projectId: projectEntry.clockifyProjectId } : {}),
        ...(tagIds.length > 0 ? { tagIds } : {}),
        billable: task.billable,
      });
    }
  }
}
