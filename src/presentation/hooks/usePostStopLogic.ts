import { cancelTask as cancelTaskUC } from "@domain/usecases/tasks/CancelTask";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { updateTask as updateTaskUC } from "@domain/usecases/tasks/UpdateTask";
import { shouldDiscardTask, computeRoundedDuration } from "@domain/utils/taskStopRules";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useAutoSync } from "@presentation/contexts/AutoSyncContext";
import type { ConfigContextValue } from "@shared/types/appConfig";
import type { Task } from "@domain/entities/Task";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import { emit } from "@tauri-apps/api/event";
import { useCallback } from "react";

export function usePostStopLogic(config: ConfigContextValue, triggerReload: () => void) {
  const { taskRepo, plannedTaskRepo } = useRepositories();
  const { runPerTask } = useAutoSync();
  const autoSyncTask = useCallback(
    async (stoppedTask: Task) => {
      if (!config.isLoaded) return;
      const results = await runPerTask(stoppedTask);
      triggerReload();
      const errors = results.filter((r) => r.error);
      const sent = results.filter((r) => !r.error && r.count > 0);
      const warnings = results.filter((r) => !r.error && r.warning);

      for (const r of errors) await showToast("error", r.error!.message);

      if (errors.length === 0) {
        const sentLabel = sent.map((r) => r.integration).join(" e ");
        const warningText = warnings.map((r) => r.warning!).join(" ");
        if (sent.length > 0 && warnings.length === 0) {
          await showToast("success", `Tarefa enviada para ${sentLabel}`);
        } else if (sent.length > 0 && warnings.length > 0) {
          await showToast("warning", `Tarefa enviada para ${sentLabel}. ${warningText}`);
        } else if (warnings.length > 0) {
          await showToast("warning", warningText);
        }
      }
    },
    [config, runPerTask, triggerReload]
  );

  const completePlannedIfNeeded = useCallback(
    async (plannedTaskId: string | null | undefined) => {
      if (!plannedTaskId) return;
      await completePlannedTask(plannedTaskRepo, plannedTaskId, todayISO());
      await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
    },
    [plannedTaskRepo]
  );

  // Aplica regras pós-stop: descarte (<1 min) e arredondamento.
  // Retorna a tarefa final (possivelmente atualizada) ou null se descartada.
  const applyStopRules = useCallback(
    async (
      task: Task,
      plannedTaskId: string | null | undefined,
      completed: boolean
    ): Promise<Task | null> => {
      const duration = task.durationSeconds ?? 0;

      if (shouldDiscardTask(duration, config.get("discardTasksUnderOneMinute"))) {
        await cancelTaskUC(taskRepo, task.id);
        triggerReload();
        await showToast("info", "Tarefa descartada (menos de 1 minuto)");
        return null;
      }

      let finalTask = task;
      const rounded = computeRoundedDuration(
        duration,
        config.get("roundingEnabled"),
        config.get("roundingSlots"),
        config.get("roundingTolerance")
      );
      if (rounded !== null) {
        finalTask = await updateTaskUC(
          taskRepo,
          task.id,
          { durationSeconds: rounded },
          task.updatedAt
        );
        triggerReload();
      }

      if (completed) {
        // O vínculo atravessa janelas e eventos de mão em mão (§4.1), e quem
        // esquecer de repassá-lo deixaria a planejada pendente em silêncio. Aqui
        // `null` explícito também cai na tarefa, ao contrário do que vale no
        // evento entre janelas: o vínculo gravado é imutável e é a verdade.
        await completePlannedIfNeeded(plannedTaskId ?? task.plannedTaskId);
        await autoSyncTask(finalTask);
      }

      return finalTask;
    },
    [config, taskRepo, triggerReload, completePlannedIfNeeded, autoSyncTask]
  );

  return { applyStopRules };
}
