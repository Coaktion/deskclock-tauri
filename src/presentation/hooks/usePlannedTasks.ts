import { useState, useEffect, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { getPlannedTasksForDate } from "@domain/usecases/plannedTasks/GetPlannedTasksForDate";
import { getPlannedTasksForWeek } from "@domain/usecases/plannedTasks/GetPlannedTasksForWeek";
import { createPlannedTask } from "@domain/usecases/plannedTasks/CreatePlannedTask";
import { updatePlannedTask } from "@domain/usecases/plannedTasks/UpdatePlannedTask";
import { deletePlannedTask } from "@domain/usecases/plannedTasks/DeletePlannedTask";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { uncompletePlannedTask } from "@domain/usecases/plannedTasks/UncompletePlannedTask";
import { duplicatePlannedTask } from "@domain/usecases/plannedTasks/DuplicatePlannedTask";
import type { ScheduleType, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { UUID } from "@shared/types";


interface CreateInput {
  name: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable: boolean;
  scheduleType: ScheduleType;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[];
}

interface UpdateInput {
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  scheduleType?: ScheduleType;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[];
}

function usePlannedTasksBase(
  loadFn: (repo: IPlannedTaskRepository) => Promise<PlannedTask[]>,
  onMutate?: () => void
) {
  const { plannedTaskRepo } = useRepositories();
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const load = useCallback(async () => {
    setTasks(await loadFn(plannedTaskRepo));
  }, [plannedTaskRepo, loadFn]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (input: CreateInput) => {
      await createPlannedTask(plannedTaskRepo, input, new Date().toISOString());
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  const update = useCallback(
    async (id: UUID, input: UpdateInput) => {
      await updatePlannedTask(plannedTaskRepo, id, input);
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  const remove = useCallback(
    async (id: UUID) => {
      await deletePlannedTask(plannedTaskRepo, id);
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  const complete = useCallback(
    async (id: UUID, date: string) => {
      await completePlannedTask(plannedTaskRepo, id, date);
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  const uncomplete = useCallback(
    async (id: UUID, date: string) => {
      await uncompletePlannedTask(plannedTaskRepo, id, date);
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  const duplicate = useCallback(
    async (id: UUID) => {
      await duplicatePlannedTask(plannedTaskRepo, id, new Date().toISOString());
      await load();
      onMutate?.();
    },
    [plannedTaskRepo, load, onMutate]
  );

  return { tasks, reload: load, create, update, remove, complete, uncomplete, duplicate };
}

export function usePlannedTasksForDate(dateISO: string) {
  const loadFn = useCallback(
    (repo: IPlannedTaskRepository) => getPlannedTasksForDate(repo, dateISO),
    [dateISO]
  );
  const base = usePlannedTasksBase(loadFn);
  const { reload } = base;

  // Recarrega quando outra janela muta tarefas planejadas
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, () => reload());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [reload]);

  return base;
}

export function usePlannedTasksForWeek(startISO: string, endISO: string) {
  const loadFn = useCallback(
    (repo: IPlannedTaskRepository) => getPlannedTasksForWeek(repo, startISO, endISO),
    [startISO, endISO]
  );
  const onMutate = useCallback(() => {
    emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
  }, []);

  return usePlannedTasksBase(loadFn, onMutate);
}
