import { useState, useEffect, useCallback } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { PlannedTask } from "@domain/entities/PlannedTask";
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

export function usePlannedTasksForDate(dateISO: string) {
  const { plannedTaskRepo } = useRepositories();
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const load = useCallback(async () => {
    const result = await getPlannedTasksForDate(plannedTaskRepo, dateISO);
    setTasks(result);
  }, [plannedTaskRepo, dateISO]);

  useEffect(() => {
    load();
  }, [load]);

  // Recarrega quando outra janela muta tarefas planejadas
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, () => {
      load();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [load]);

  const create = useCallback(
    async (input: CreateInput) => {
      await createPlannedTask(plannedTaskRepo, input, new Date().toISOString());
      await load();
    },
    [plannedTaskRepo, load]
  );

  const update = useCallback(
    async (id: UUID, input: UpdateInput) => {
      await updatePlannedTask(plannedTaskRepo, id, input);
      await load();
    },
    [plannedTaskRepo, load]
  );

  const remove = useCallback(
    async (id: UUID) => {
      await deletePlannedTask(plannedTaskRepo, id);
      await load();
    },
    [plannedTaskRepo, load]
  );

  const complete = useCallback(
    async (id: UUID, date: string) => {
      await completePlannedTask(plannedTaskRepo, id, date);
      await load();
    },
    [plannedTaskRepo, load]
  );

  const uncomplete = useCallback(
    async (id: UUID, date: string) => {
      await uncompletePlannedTask(plannedTaskRepo, id, date);
      await load();
    },
    [plannedTaskRepo, load]
  );

  const duplicate = useCallback(
    async (id: UUID) => {
      await duplicatePlannedTask(plannedTaskRepo, id, new Date().toISOString());
      await load();
    },
    [plannedTaskRepo, load]
  );

  return { tasks, reload: load, create, update, remove, complete, uncomplete, duplicate };
}

export function usePlannedTasksForWeek(startISO: string, endISO: string) {
  const { plannedTaskRepo } = useRepositories();
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const load = useCallback(async () => {
    const result = await getPlannedTasksForWeek(plannedTaskRepo, startISO, endISO);
    setTasks(result);
  }, [plannedTaskRepo, startISO, endISO]);

  useEffect(() => {
    load();
  }, [load]);

  const notifyChanged = useCallback(() => {
    emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
  }, []);

  const create = useCallback(
    async (input: CreateInput) => {
      await createPlannedTask(plannedTaskRepo, input, new Date().toISOString());
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  const update = useCallback(
    async (id: UUID, input: UpdateInput) => {
      await updatePlannedTask(plannedTaskRepo, id, input);
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  const remove = useCallback(
    async (id: UUID) => {
      await deletePlannedTask(plannedTaskRepo, id);
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  const complete = useCallback(
    async (id: UUID, date: string) => {
      await completePlannedTask(plannedTaskRepo, id, date);
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  const uncomplete = useCallback(
    async (id: UUID, date: string) => {
      await uncompletePlannedTask(plannedTaskRepo, id, date);
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  const duplicate = useCallback(
    async (id: UUID) => {
      await duplicatePlannedTask(plannedTaskRepo, id, new Date().toISOString());
      await load();
      notifyChanged();
    },
    [plannedTaskRepo, load, notifyChanged]
  );

  return { tasks, reload: load, create, update, remove, complete, uncomplete, duplicate };
}
