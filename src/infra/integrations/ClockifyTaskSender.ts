import type { Task } from "@domain/entities/Task";
import type { ITaskSender, TaskSendOutcome } from "@domain/integrations/ITaskSender";
import type { IClockifyConfigPort } from "@domain/integrations/IClockifyConfigPort";
import { validateTaskForClockify } from "@domain/integrations/taskValidation";
import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import { ClockifyClient } from "./clockify/ClockifyClient";

export class ClockifyTaskSender implements ITaskSender {
  readonly integrationName = "Clockify";
  private client: IClockifyApi;

  constructor(
    private config: IClockifyConfigPort,
    client?: IClockifyApi
  ) {
    this.client = client ?? new ClockifyClient(config.get("clockifyApiKey"));
  }

  async send(tasks: Task[]): Promise<TaskSendOutcome> {
    const workspaceId = this.config.get("clockifyActiveWorkspaceId");
    if (!workspaceId) throw new Error("Nenhum workspace Clockify configurado.");

    const projectMapping = this.config
      .get("clockifyProjectMapping")
      .filter((m) => m.workspaceId === workspaceId);
    const categoryMapping = this.config
      .get("clockifyCategoryMapping")
      .filter((m) => m.workspaceId === workspaceId);
    const defaultTagIds = this.config.get("clockifyDefaultTagIds");

    const allCompleted = tasks.filter((t) => t.status === "completed" && t.endTime != null);
    const completedTasks = allCompleted.filter((t) => validateTaskForClockify(t).ok);

    if (completedTasks.length === 0 && allCompleted.length > 0) {
      throw new Error("Nenhuma tarefa válida para enviar ao Clockify (precisa de nome e projeto).");
    }

    // Uma entry que falha não cancela as seguintes. Sem o `try` por tarefa, o
    // erro na quinta de dez deixava quatro entries no Clockify e nenhuma
    // marcada como enviada — e o reenvio, sem rastreamento equivalente ao do
    // Monday, **duplicava** justamente essas quatro.
    const sentTaskIds: string[] = [];
    // Só `failed` aqui: o Clockify não recusa por dado faltando — a validação
    // que ele exige já filtrou acima, e o que sobra é falha de rede ou da API.
    const failed: string[] = [];

    for (const task of completedTasks) {
      const start = new Date(task.startTime);
      const durationSec = task.durationSeconds ?? 0;
      const end = new Date(start.getTime() + durationSec * 1000);

      const projectEntry = task.projectId
        ? projectMapping.find((m) => m.deskclockProjectId === task.projectId)
        : undefined;

      const categoryTagIds = task.categoryId
        ? (categoryMapping.find((m) => m.deskclockCategoryId === task.categoryId)?.clockifyTagIds ??
          [])
        : [];

      const tagIds = Array.from(new Set([...defaultTagIds, ...categoryTagIds]));

      try {
        await this.client.createTimeEntry(workspaceId, {
          start: start.toISOString(),
          end: end.toISOString(),
          description: task.name!.trim(),
          ...(projectEntry ? { projectId: projectEntry.clockifyProjectId } : {}),
          ...(tagIds.length > 0 ? { tagIds } : {}),
          billable: task.billable,
        });
        sentTaskIds.push(task.id);
      } catch (err) {
        failed.push(`"${task.name!.trim()}": ${err instanceof Error ? err.message : String(err)}.`);
      }
    }

    return { sentTaskIds, refused: [], failed };
  }
}
