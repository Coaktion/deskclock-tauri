import { describe, it, expect, vi } from "vitest";
import { MAX_SUMMARY_DAYS, summarizeWorkdays } from "@domain/usecases/llm/SummarizeWorkdays";
import { LlmRateLimitError } from "@infra/integrations/llm/errors";
import { localISO } from "../../../helpers/localTime";
import type { DaySummary } from "@domain/entities/DaySummary";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { IDaySummaryRepository } from "@domain/repositories/IDaySummaryRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";

const WS = "ws-1";

/** Sete dias úteis seguidos, do mais antigo para o mais recente. */
const DIAS = [
  "2026-08-17",
  "2026-08-18",
  "2026-08-19",
  "2026-08-20",
  "2026-08-21",
  "2026-08-24",
  "2026-08-25",
];

function makeTask(dateISO: string): Task {
  const [ano, mes, dia] = dateISO.split("-").map(Number);
  const start = localISO(ano, mes, dia, 9);
  return {
    id: `t-${dateISO}`,
    workspaceId: WS,
    name: "Corrigir bug do overlay",
    projectId: "p1",
    categoryId: null,
    billable: true,
    startTime: start,
    endTime: localISO(ano, mes, dia, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: start,
    updatedAt: start,
    customValues: {},
  };
}

/** O repositório devolve, para qualquer intervalo pedido, uma tarefa concluída. */
function makeTaskRepo(): ITaskRepository {
  return {
    save: vi.fn(),
    update: vi.fn(),
    findById: vi.fn(async () => null),
    findByStatus: vi.fn(async () => []),
    findByDateRange: vi.fn(async (startISO: string) => [makeTask(startISO.slice(0, 10))]),
    findLastDayWithCompletedTasks: vi.fn(async () => null),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  };
}

function makeSummaryRepo(existing: DaySummary[] = []): IDaySummaryRepository {
  return {
    findByDays: vi.fn(async (_workspaceId: string, dateISOs: string[]) =>
      existing.filter((entry) => dateISOs.includes(entry.dateISO))
    ),
    save: vi.fn(),
  };
}

function makeLlm(answer = "Resumo do dia."): ILlmApi {
  return {
    complete: vi.fn(async () => ({ text: answer })),
    listModels: vi.fn(async () => []),
  };
}

function makeCached(dateISO: string, summary = "Texto guardado."): DaySummary {
  return { dateISO, workspaceId: WS, summary, generatedAt: localISO(2026, 8, 26, 8) };
}

const projectNameById = (id: string | null) => (id ? "DeskClock" : undefined);

function run(
  deps: {
    taskRepo?: ITaskRepository;
    daySummaryRepo?: IDaySummaryRepository;
    llm?: ILlmApi;
  },
  dateISOs: string[],
  onProgress?: (progress: { done: number; total: number }) => void,
  unfinishedDayISO?: string
) {
  return summarizeWorkdays(
    {
      taskRepo: deps.taskRepo ?? makeTaskRepo(),
      daySummaryRepo: deps.daySummaryRepo ?? makeSummaryRepo(),
      llm: deps.llm ?? makeLlm(),
    },
    { workspaceId: WS, dateISOs, projectNameById, onProgress, unfinishedDayISO }
  );
}

describe("summarizeWorkdays", () => {
  it("resume no máximo MAX_SUMMARY_DAYS dias, mesmo com a busca trazendo mais", async () => {
    const llm = makeLlm();

    const outcome = await run({ llm }, DIAS);

    expect(DIAS.length).toBeGreaterThan(MAX_SUMMARY_DAYS);
    expect(outcome.summaries).toHaveLength(MAX_SUMMARY_DAYS);
    expect(llm.complete).toHaveBeenCalledTimes(MAX_SUMMARY_DAYS);
  });

  it("quando há mais dias que o teto, fica com os mais recentes", async () => {
    const outcome = await run({}, DIAS);

    expect(outcome.summaries.map((s) => s.dateISO)).toEqual([
      "2026-08-25",
      "2026-08-24",
      "2026-08-21",
      "2026-08-20",
      "2026-08-19",
    ]);
  });

  it("dia já resumido sai da tabela e não vira requisição", async () => {
    const llm = makeLlm();
    const daySummaryRepo = makeSummaryRepo([makeCached("2026-08-25")]);

    const outcome = await run({ llm, daySummaryRepo }, ["2026-08-25", "2026-08-24"]);

    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(outcome.summaries).toEqual([
      { dateISO: "2026-08-25", summary: "Texto guardado.", source: "cache" },
      { dateISO: "2026-08-24", summary: "Resumo do dia.", source: "generated" },
    ]);
    expect(daySummaryRepo.save).toHaveBeenCalledTimes(1);
  });

  it("o dia que ainda não acabou ignora o cache e é gerado de novo", async () => {
    const llm = makeLlm();
    const daySummaryRepo = makeSummaryRepo([makeCached("2026-08-25"), makeCached("2026-08-24")]);

    const outcome = await run(
      { llm, daySummaryRepo },
      ["2026-08-25", "2026-08-24"],
      undefined,
      "2026-08-25"
    );

    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(outcome.summaries).toEqual([
      { dateISO: "2026-08-25", summary: "Resumo do dia.", source: "generated" },
      { dateISO: "2026-08-24", summary: "Texto guardado.", source: "cache" },
    ]);
  });

  it("sem `unfinishedDayISO`, todo dia guardado vale — inclusive o mais recente", async () => {
    const llm = makeLlm();
    const daySummaryRepo = makeSummaryRepo([makeCached("2026-08-25")]);

    await run({ llm, daySummaryRepo }, ["2026-08-25"]);

    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("grava na tabela o dia que acabou de gerar", async () => {
    const daySummaryRepo = makeSummaryRepo();

    await run({ daySummaryRepo }, ["2026-08-25"]);

    expect(daySummaryRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        dateISO: "2026-08-25",
        workspaceId: WS,
        summary: "Resumo do dia.",
      })
    );
  });

  it("falha de um dia não derruba os outros", async () => {
    const llm = makeLlm();
    vi.mocked(llm.complete)
      .mockResolvedValueOnce({ text: "Resumo de sexta." })
      .mockRejectedValueOnce(new Error("500 do provedor"))
      .mockResolvedValueOnce({ text: "Resumo de quarta." });

    const outcome = await run({ llm }, ["2026-08-19", "2026-08-20", "2026-08-21"]);

    expect(outcome.summaries.map((s) => s.dateISO)).toEqual(["2026-08-21", "2026-08-19"]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.failed[0].dateISO).toBe("2026-08-20");
    expect(outcome.skipped).toEqual([]);
  });

  it("para no primeiro limite de cota e devolve os dias restantes como não gerados", async () => {
    const llm = makeLlm();
    vi.mocked(llm.complete)
      .mockResolvedValueOnce({ text: "Resumo de terça." })
      .mockRejectedValueOnce(new LlmRateLimitError(30));

    const outcome = await run({ llm }, ["2026-08-19", "2026-08-20", "2026-08-21", "2026-08-24"]);

    // Só duas chamadas: a que deu certo e a que bateu no limite.
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(outcome.summaries.map((s) => s.dateISO)).toEqual(["2026-08-24"]);
    expect(outcome.failed.map((f) => f.dateISO)).toEqual(["2026-08-21"]);
    expect(outcome.skipped).toEqual(["2026-08-20", "2026-08-19"]);
  });

  it("chama o provedor um dia de cada vez, nunca em paralelo", async () => {
    let emVoo = 0;
    let maxEmVoo = 0;
    const llm: ILlmApi = {
      complete: vi.fn(async () => {
        emVoo += 1;
        maxEmVoo = Math.max(maxEmVoo, emVoo);
        await Promise.resolve();
        emVoo -= 1;
        return { text: "Resumo do dia." };
      }),
      listModels: vi.fn(async () => []),
    };

    await run({ llm }, ["2026-08-19", "2026-08-20", "2026-08-21"]);

    expect(maxEmVoo).toBe(1);
  });

  it("avisa o andamento antes de cada dia", async () => {
    const onProgress = vi.fn();

    await run({}, ["2026-08-20", "2026-08-21"], onProgress);

    expect(onProgress.mock.calls).toEqual([[{ done: 0, total: 2 }], [{ done: 1, total: 2 }]]);
  });

  it("guarda a última cota que o provedor informou", async () => {
    const llm = makeLlm();
    vi.mocked(llm.complete)
      .mockResolvedValueOnce({ text: "a", limits: { requestsRemaining: 900 } })
      .mockResolvedValueOnce({ text: "b", limits: { requestsRemaining: 899 } });

    const outcome = await run({ llm }, ["2026-08-20", "2026-08-21"]);

    expect(outcome.limits).toEqual({ requestsRemaining: 899 });
  });

  it("dia sem tarefa nomeada não vira resumo nem falha", async () => {
    const taskRepo = makeTaskRepo();
    vi.mocked(taskRepo.findByDateRange).mockResolvedValue([]);
    const llm = makeLlm();

    const outcome = await run({ taskRepo, llm }, ["2026-08-20"]);

    expect(llm.complete).not.toHaveBeenCalled();
    expect(outcome.summaries).toEqual([]);
    expect(outcome.failed).toEqual([]);
  });
});
