import { describe, it, expect, vi } from "vitest";
import { summarizeWorkday } from "@domain/usecases/llm/SummarizeWorkday";
import { localISO } from "../../../helpers/localTime";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import type { LlmRateLimits } from "@shared/types/llm";

const DAY = "2026-08-25";

function makeTask(overrides: Partial<Task> = {}): Task {
  const start = localISO(2026, 8, 25, 9);
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Corrigir bug do overlay",
    projectId: "p1",
    categoryId: null,
    billable: true,
    startTime: start,
    endTime: localISO(2026, 8, 25, 10, 30),
    durationSeconds: 5400,
    status: "completed",
    createdAt: start,
    updatedAt: start,
    customValues: {},
    ...overrides,
  };
}

function makeRepo(day: string | null, tasks: Task[]): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async () => tasks),
    findLastDayWithCompletedTasks: vi.fn(async () => day),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function makeLlm(answer = "Resumo do dia.", limits?: LlmRateLimits): ILlmApi {
  return {
    complete: vi.fn(async () => (limits ? { text: answer, limits } : { text: answer })),
    listModels: vi.fn(async () => []),
  };
}

const PROJECT_NAMES: Record<string, string> = { p1: "DeskClock", p2: "Aktie" };
const projectNameById = (id: string | null) => (id ? PROJECT_NAMES[id] : undefined);

function promptOf(llm: ILlmApi): string {
  const [messages] = vi.mocked(llm.complete).mock.calls[0];
  return messages[1].content;
}

describe("summarizeWorkday", () => {
  it("devolve null e não chama o LLM quando não há dia com tarefa", async () => {
    const llm = makeLlm();
    const result = await summarizeWorkday(
      { taskRepo: makeRepo(null, []), llm },
      { projectNameById }
    );
    expect(result).toBeNull();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("devolve null e não chama o LLM quando o dia não tem tarefa com nome", async () => {
    const llm = makeLlm();
    const repo = makeRepo(DAY, [makeTask({ name: null }), makeTask({ id: "t2", name: "  " })]);
    const result = await summarizeWorkday({ taskRepo: repo, llm }, { projectNameById });
    expect(result).toBeNull();
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("devolve o dia encontrado e o texto do LLM", async () => {
    const llm = makeLlm("  Trabalhou no overlay.  ");
    const result = await summarizeWorkday(
      { taskRepo: makeRepo(DAY, [makeTask()]), llm },
      { projectNameById }
    );
    expect(result).toEqual({ dateISO: DAY, summary: "Trabalhou no overlay." });
  });

  it("monta o prompt com nome, projeto e duração da tarefa", async () => {
    const llm = makeLlm();
    await summarizeWorkday({ taskRepo: makeRepo(DAY, [makeTask()]), llm }, { projectNameById });
    expect(promptOf(llm)).toContain("Corrigir bug do overlay (DeskClock) — 1h30m");
  });

  it("soma tarefas iguais numa única linha em vez de repetir o nome", async () => {
    const llm = makeLlm();
    const repo = makeRepo(DAY, [
      makeTask({ id: "t1", name: "Reunião", projectId: null, durationSeconds: 900 }),
      makeTask({ id: "t2", name: "Reunião", projectId: null, durationSeconds: 1800 }),
    ]);
    await summarizeWorkday({ taskRepo: repo, llm }, { projectNameById });
    expect(promptOf(llm)).toBe("<tarefas>\nReunião — 45m\n</tarefas>");
  });

  it("mantém linhas separadas para o mesmo nome em projetos diferentes", async () => {
    const llm = makeLlm();
    const repo = makeRepo(DAY, [
      makeTask({ id: "t1", name: "Reunião", projectId: "p1", durationSeconds: 900 }),
      makeTask({ id: "t2", name: "Reunião", projectId: "p2", durationSeconds: 900 }),
    ]);
    await summarizeWorkday({ taskRepo: repo, llm }, { projectNameById });
    expect(promptOf(llm)).toBe(
      "<tarefas>\nReunião (DeskClock) — 15m\nReunião (Aktie) — 15m\n</tarefas>"
    );
  });

  it("ignora as tarefas sem nome e resume as demais", async () => {
    const llm = makeLlm();
    const repo = makeRepo(DAY, [
      makeTask({ id: "t1", name: null, durationSeconds: 3600 }),
      makeTask({ id: "t2", name: "Revisão de PR", projectId: null, durationSeconds: 1800 }),
    ]);
    await summarizeWorkday({ taskRepo: repo, llm }, { projectNameById });
    expect(promptOf(llm)).toBe("<tarefas>\nRevisão de PR — 30m\n</tarefas>");
  });

  it("encaminha o workspace ao repositório", async () => {
    const repo = makeRepo(DAY, [makeTask()]);
    await summarizeWorkday(
      { taskRepo: repo, llm: makeLlm() },
      { workspaceId: "ws-1", projectNameById }
    );
    expect(repo.findLastDayWithCompletedTasks).toHaveBeenCalledWith("ws-1");
    expect(repo.findByDateRange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "ws-1"
    );
  });

  it("devolve a cota que o provedor informou na resposta", async () => {
    const limits: LlmRateLimits = { requestsLimit: 1000, requestsRemaining: 312 };
    const llm = makeLlm("Trabalhou no overlay.", limits);
    const result = await summarizeWorkday(
      { taskRepo: makeRepo(DAY, [makeTask()]), llm },
      { projectNameById }
    );
    expect(result?.limits).toEqual(limits);
  });

  it("omite a cota quando o provedor não a informa", async () => {
    const result = await summarizeWorkday(
      { taskRepo: makeRepo(DAY, [makeTask()]), llm: makeLlm() },
      { projectNameById }
    );
    expect(result?.limits).toBeUndefined();
  });

  it("propaga o erro do LLM — quem distingue chave inválida de rate limit é a tela", async () => {
    const llm: ILlmApi = {
      complete: vi.fn(async () => {
        throw new Error("401 Unauthorized");
      }),
      listModels: vi.fn(async () => []),
    };
    await expect(
      summarizeWorkday({ taskRepo: makeRepo(DAY, [makeTask()]), llm }, { projectNameById })
    ).rejects.toThrow("401 Unauthorized");
  });
});
