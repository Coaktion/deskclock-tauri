import { describe, it, expect, vi } from "vitest";
import {
  sendTasks,
  NoIntegrationError,
  NoTasksSelectedError,
} from "@domain/usecases/tasks/SendTasks";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { Task } from "@domain/entities/Task";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Task A",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: "2026-04-08T09:00:00.000Z",
    endTime: "2026-04-08T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-08T09:00:00.000Z",
    updatedAt: "2026-04-08T10:00:00.000Z",
    ...overrides,
  };
}

function makeSender(overrides: Partial<ITaskSender> = {}): ITaskSender {
  return {
    integrationName: "Mock Integration",
    send: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("sendTasks", () => {
  it("lança NoIntegrationError quando sender é null", async () => {
    await expect(sendTasks(null, [makeTask()])).rejects.toThrow(NoIntegrationError);
  });

  it("NoIntegrationError tem name correto", async () => {
    await expect(sendTasks(null, [makeTask()])).rejects.toMatchObject({
      name: "NoIntegrationError",
    });
  });

  it("lança NoTasksSelectedError quando lista é vazia", async () => {
    const sender = makeSender();
    await expect(sendTasks(sender, [])).rejects.toThrow(NoTasksSelectedError);
  });

  it("NoTasksSelectedError tem name correto", async () => {
    const sender = makeSender();
    await expect(sendTasks(sender, [])).rejects.toMatchObject({
      name: "NoTasksSelectedError",
    });
  });

  it("chama sender.send com as tarefas fornecidas", async () => {
    const sender = makeSender();
    const tasks = [makeTask({ id: "t1" }), makeTask({ id: "t2" })];
    await sendTasks(sender, tasks);
    expect(sender.send).toHaveBeenCalledWith(tasks);
  });

  it("chama sender.send exatamente uma vez", async () => {
    const sender = makeSender();
    await sendTasks(sender, [makeTask()]);
    expect(sender.send).toHaveBeenCalledTimes(1);
  });

  it("propaga erros lançados pelo sender", async () => {
    const sender = makeSender({
      send: vi.fn(async () => {
        throw new Error("Falha na integração");
      }),
    });
    await expect(sendTasks(sender, [makeTask()])).rejects.toThrow("Falha na integração");
  });

  it("não lança erro com sender e tarefas válidos", async () => {
    const sender = makeSender();
    await expect(sendTasks(sender, [makeTask()])).resolves.toBeUndefined();
  });
});
