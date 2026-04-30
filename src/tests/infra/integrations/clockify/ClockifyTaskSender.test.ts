import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Task } from "@domain/entities/Task";
import type { AppConfig, ConfigContextValue } from "@presentation/contexts/ConfigContext";
import type { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import type { ClockifyTimeEntryPayload } from "@infra/integrations/clockify/types";
import { ClockifyTaskSender } from "@infra/integrations/ClockifyTaskSender";

function makeConfig(overrides: Partial<AppConfig> = {}): ConfigContextValue {
  const store: Partial<AppConfig> = {
    clockifyApiKey: "key-test",
    clockifyActiveWorkspaceId: "ws1",
    clockifyDefaultTagIds: [],
    clockifyProjectMapping: [],
    clockifyCategoryMapping: [],
    ...overrides,
  };
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn(<K extends keyof AppConfig>(key: K) => store[key] as AppConfig[K]),
    set: vi.fn(),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    name: "Tarefa teste",
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-04-30T09:00:00.000Z",
    endTime: "2026-04-30T10:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: "2026-04-30T09:00:00.000Z",
    updatedAt: "2026-04-30T10:00:00.000Z",
    ...overrides,
  };
}

function makeClient(): ClockifyClient {
  return { createTimeEntry: vi.fn().mockResolvedValue({ id: "te1" }) } as unknown as ClockifyClient;
}

describe("ClockifyTaskSender", () => {
  let client: ClockifyClient;

  beforeEach(() => {
    client = makeClient();
  });

  it("lança erro se nenhum workspace configurado", async () => {
    const config = makeConfig({ clockifyActiveWorkspaceId: "" });
    const sender = new ClockifyTaskSender(config, client);
    await expect(sender.send([makeTask()])).rejects.toThrow("workspace");
  });

  it("filtra tarefas não concluídas", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([
      makeTask({ status: "running" }),
      makeTask({ status: "paused" }),
    ]);
    expect(client.createTimeEntry).not.toHaveBeenCalled();
  });

  it("calcula end a partir de durationSeconds, não de endTime", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    const task = makeTask({
      startTime: "2026-04-30T09:00:00.000Z",
      endTime: "2026-04-30T10:30:00.000Z",
      durationSeconds: 3600,
    });
    await sender.send([task]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].start).toBe("2026-04-30T09:00:00.000Z");
    expect(call[1].end).toBe("2026-04-30T10:00:00.000Z");
  });

  it("usa '(sem nome)' quando tarefa não tem nome", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ name: null })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].description).toBe("(sem nome)");
  });

  it("mapeia projeto DeskClock para projectId do Clockify", async () => {
    const config = makeConfig({
      clockifyProjectMapping: [
        {
          deskclockProjectId: "proj-1",
          clockifyProjectId: "clockify-proj-99",
          clockifyProjectName: "Prod",
          workspaceId: "ws1",
        },
      ],
    });
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ projectId: "proj-1" })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].projectId).toBe("clockify-proj-99");
  });

  it("não inclui projectId se projeto não mapeado", async () => {
    const config = makeConfig({ clockifyProjectMapping: [] });
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ projectId: "proj-nao-mapeado" })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].projectId).toBeUndefined();
  });

  it("combina tags padrão com tags da categoria, sem duplicatas", async () => {
    const config = makeConfig({
      clockifyDefaultTagIds: ["tag-a", "tag-b"],
      clockifyCategoryMapping: [
        {
          deskclockCategoryId: "cat-1",
          clockifyTagIds: ["tag-b", "tag-c"],
          workspaceId: "ws1",
        },
      ],
    });
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ categoryId: "cat-1" })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].tagIds).toEqual(["tag-a", "tag-b", "tag-c"]);
  });

  it("não inclui tagIds quando não há tags configuradas", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask()]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].tagIds).toBeUndefined();
  });

  it("repassa billable da tarefa", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ billable: false })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].billable).toBe(false);
  });

  it("ignora mapeamentos de outros workspaces", async () => {
    const config = makeConfig({
      clockifyProjectMapping: [
        {
          deskclockProjectId: "proj-1",
          clockifyProjectId: "clockify-proj-outro",
          clockifyProjectName: "Outro",
          workspaceId: "ws-outro",
        },
      ],
    });
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ projectId: "proj-1" })]);

    const call = (client.createTimeEntry as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      ClockifyTimeEntryPayload,
    ];
    expect(call[1].projectId).toBeUndefined();
  });

  it("envia múltiplas tarefas em sequência", async () => {
    const config = makeConfig();
    const sender = new ClockifyTaskSender(config, client);
    await sender.send([makeTask({ id: "t1" }), makeTask({ id: "t2" })]);
    expect(client.createTimeEntry).toHaveBeenCalledTimes(2);
  });
});
