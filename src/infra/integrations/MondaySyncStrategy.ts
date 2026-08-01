import type { Task } from "@domain/entities/Task";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IMondayActivityItemRepository } from "@domain/repositories/IMondayActivityItemRepository";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { IMondayConfigPort } from "@domain/integrations/IMondayConfigPort";
import { validateTaskForMonday, formatMissingFields } from "@domain/integrations/taskValidation";
import { localDateISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { runMondayDailySync, MONDAY_LOG_KEY } from "./runMondayDailySync";
import { MondayTaskSender } from "./MondayTaskSender";

export const MONDAY_INTEGRATION_NAME = "Monday";

export class MondaySyncStrategy implements ISyncStrategy {
  readonly integrationName = MONDAY_INTEGRATION_NAME;

  constructor(
    private config: IMondayConfigPort,
    private taskRepo: ITaskRepository,
    private logRepo: ITaskIntegrationLogRepository,
    private itemRepo: IMondayActivityItemRepository,
    private customFieldRepo: ICustomFieldRepository,
    private categoryRepo: ICategoryRepository
  ) {}

  private isEnabled(mode: "per-task" | "daily"): boolean {
    return (
      this.config.get("mondayAutoSync") &&
      this.config.get("mondayAutoSyncMode") === mode &&
      !!this.config.get("mondayApiKey") &&
      !!this.config.get("mondayActiveWorkspaceId")
    );
  }

  isPerTaskEnabled(): boolean {
    return this.isEnabled("per-task");
  }

  isDailyEnabled(): boolean {
    return this.isEnabled("daily");
  }

  /** Ponto único de composição: cada repositório novo no sender para aqui. */
  private createSender(): MondayTaskSender {
    return new MondayTaskSender(
      this.config,
      this.itemRepo,
      this.customFieldRepo,
      this.categoryRepo
    );
  }

  /** Projetos com board mapeado no workspace ativo — sem board não há onde criar a atividade. */
  private mappedProjectIds(): Set<string> {
    const workspaceId = this.config.get("mondayActiveWorkspaceId");
    return new Set(
      this.config
        .get("mondayProjectMapping")
        .filter((m) => m.workspaceId === workspaceId)
        .map((m) => m.deskclockProjectId)
    );
  }

  /**
   * Reúne as tarefas concluídas do dia no mesmo projeto. O envio ao Monday é um
   * upsert por grupo, então mandar só a tarefa recém-parada sobrescreveria o item
   * com a duração parcial.
   *
   * O escopo é o **projeto no dia**, e não apenas o grupo da tarefa, para casar
   * com a janela de reconciliação do sender (board + dia): se a tarefa mudou de
   * grupo, o item que a continha precisa estar no envio para ser corrigido — do
   * contrário as horas das tarefas restantes daquele item ficariam sem item.
   * Grupos inalterados não custam chamada de API: caem no skip por payload igual.
   */
  private async collectSameDayScope(task: Task): Promise<Task[]> {
    const day = localDateISO(task.startTime);
    const sameDay = await this.taskRepo.findByDateRange(startOfDayISO(day), endOfDayISO(day));
    const others = sameDay.filter(
      (t) => t.id !== task.id && t.status === "completed" && t.projectId === task.projectId
    );
    return [task, ...others];
  }

  async runPerTask(task: Task): Promise<AutoSyncResult> {
    const validation = validateTaskForMonday(task);
    if (!validation.ok) {
      return {
        integration: this.integrationName,
        count: 0,
        warning: `Tarefa não enviada ao Monday: faltam ${formatMissingFields(validation.missing)}.`,
      };
    }
    if (!this.mappedProjectIds().has(task.projectId!)) {
      return {
        integration: this.integrationName,
        count: 0,
        warning: `Tarefa não enviada ao Monday: o projeto não está mapeado para um board.`,
      };
    }
    try {
      const group = await this.collectSameDayScope(task);
      const sender = this.createSender();
      await sender.send(group);
      await this.logRepo.markSent([task.id], MONDAY_LOG_KEY);
      await this.config.set("mondayDailySyncLastTimestamp", new Date().toISOString());
      return { integration: this.integrationName, count: 1 };
    } catch (err) {
      return {
        integration: this.integrationName,
        count: 0,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async runDaily(endDateISO: string): Promise<AutoSyncResult> {
    // Resolvido uma vez por execução: o sender pula tarefas sem board, e marcá-las
    // como enviadas daria à UI um badge de "enviado" que nunca chegou ao Monday.
    const mapped = this.mappedProjectIds();
    return runMondayDailySync(
      {
        integrationName: this.integrationName,
        taskRepo: this.taskRepo,
        logRepo: this.logRepo,
        timestampPort: {
          get: () => this.config.get("mondayDailySyncLastTimestamp"),
          set: (iso) => this.config.set("mondayDailySyncLastTimestamp", iso),
        },
        validate: (t: Task) => validateTaskForMonday(t).ok && mapped.has(t.projectId!),
        createSender: () => this.createSender(),
      },
      endDateISO
    );
  }
}
