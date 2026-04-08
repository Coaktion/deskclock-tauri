import { useState, useEffect, useCallback } from "react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
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

const repo = new PlannedTaskRepository();

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
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const load = useCallback(async () => {
    const result = await getPlannedTasksForDate(repo, dateISO);
    setTasks(result);
  }, [dateISO]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreateInput) => {
    await createPlannedTask(repo, input, new Date().toISOString());
    await load();
  }, [load]);

  const update = useCallback(async (id: UUID, input: UpdateInput) => {
    await updatePlannedTask(repo, id, input);
    await load();
  }, [load]);

  const remove = useCallback(async (id: UUID) => {
    await deletePlannedTask(repo, id);
    await load();
  }, [load]);

  const complete = useCallback(async (id: UUID, date: string) => {
    await completePlannedTask(repo, id, date);
    await load();
  }, [load]);

  const uncomplete = useCallback(async (id: UUID, date: string) => {
    await uncompletePlannedTask(repo, id, date);
    await load();
  }, [load]);

  const duplicate = useCallback(async (id: UUID) => {
    await duplicatePlannedTask(repo, id, new Date().toISOString());
    await load();
  }, [load]);

  return { tasks, reload: load, create, update, remove, complete, uncomplete, duplicate };
}

export function usePlannedTasksForWeek(startISO: string, endISO: string) {
  const [tasks, setTasks] = useState<PlannedTask[]>([]);

  const load = useCallback(async () => {
    const result = await getPlannedTasksForWeek(repo, startISO, endISO);
    setTasks(result);
  }, [startISO, endISO]);

  useEffect(() => { load(); }, [load]);

  const create = useCallback(async (input: CreateInput) => {
    await createPlannedTask(repo, input, new Date().toISOString());
    await load();
  }, [load]);

  const update = useCallback(async (id: UUID, input: UpdateInput) => {
    await updatePlannedTask(repo, id, input);
    await load();
  }, [load]);

  const remove = useCallback(async (id: UUID) => {
    await deletePlannedTask(repo, id);
    await load();
  }, [load]);

  const complete = useCallback(async (id: UUID, date: string) => {
    await completePlannedTask(repo, id, date);
    await load();
  }, [load]);

  const uncomplete = useCallback(async (id: UUID, date: string) => {
    await uncompletePlannedTask(repo, id, date);
    await load();
  }, [load]);

  const duplicate = useCallback(async (id: UUID) => {
    await duplicatePlannedTask(repo, id, new Date().toISOString());
    await load();
  }, [load]);

  return { tasks, reload: load, create, update, remove, complete, uncomplete, duplicate };
}
