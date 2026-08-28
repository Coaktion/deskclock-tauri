import { describe, expect, it, vi } from "vitest";

import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { LlmRateLimits } from "@shared/types/llm";
import { planWeek, type PlanWeekOptions } from "@domain/usecases/llm/PlanWeek";
import { WEEK_PLAN_MAX_OUTPUT_TOKENS } from "@domain/usecases/llm/buildWeekPlanPrompt";
import { LLM_RATE_LIMIT_ERROR_NAME } from "@domain/integrations/ILlmApi";

const WEEK = [
  { dateISO: "2026-08-31", weekday: "segunda" },
  { dateISO: "2026-09-01", weekday: "terça" },
  { dateISO: "2026-09-02", weekday: "quarta" },
  { dateISO: "2026-09-03", weekday: "quinta" },
  { dateISO: "2026-09-04", weekday: "sexta" },
];

const PROJECTS: Project[] = [
  { id: "p1", workspaceId: "w1", name: "DeskClock", colorIndex: 0 },
  { id: "p2", workspaceId: "w1", name: "Aktie", colorIndex: 1 },
];

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "w1", name: "Reunião", defaultBillable: true },
  { id: "c2", workspaceId: "w1", name: "Interno", defaultBillable: false },
];

function makeLlm(answer: string, limits?: LlmRateLimits): ILlmApi {
  return {
    complete: vi.fn(async () => (limits ? { text: answer, limits } : { text: answer })),
    listModels: vi.fn(async () => []),
  };
}

function reply(...tasks: unknown[]): string {
  return JSON.stringify({ tarefas: tasks });
}

function makeOptions(overrides: Partial<PlanWeekOptions> = {}): PlanWeekOptions {
  return {
    todayISO: "2026-08-28",
    weekDays: WEEK,
    projects: PROJECTS,
    categories: CATEGORIES,
    existing: [],
    request: "quarta tem alinhamento",
    ...overrides,
  };
}

describe("planWeek", () => {
  it("faz uma única chamada, com o teto de saída do plano", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dia: "2026-09-02" }));

    await planWeek({ llm }, makeOptions());

    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(vi.mocked(llm.complete).mock.calls[0][1]).toEqual({
      maxOutputTokens: WEEK_PLAN_MAX_OUTPUT_TOKENS,
    });
  });

  it("resolve o nome do projeto para o id, ignorando caixa e espaços", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dia: "2026-09-02", projeto: "  aktie " }));

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0].projectId).toBe("p2");
  });

  it("nome de projeto que não existe vira null, e nunca projeto novo", async () => {
    const llm = makeLlm(
      reply({ nome: "Alinhamento", dia: "2026-09-02", projeto: "Cliente Fantasma" })
    );

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0].projectId).toBeNull();
  });

  it("a categoria resolvida manda no faturamento", async () => {
    // §6.2: escolher categoria preenche billable com o default dela. O que o
    // modelo achou não decide isso.
    const llm = makeLlm(
      reply({ nome: "Alinhamento", dia: "2026-09-02", categoria: "Reunião", faturavel: false })
    );

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0]).toMatchObject({ categoryId: "c1", billable: true });
  });

  it("sem categoria que case, vale o faturamento que o modelo devolveu", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dia: "2026-09-02", faturavel: true }));

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0]).toMatchObject({ categoryId: null, billable: true });
  });

  it("sem categoria e sem faturamento, a linha nasce não faturável", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dia: "2026-09-02" }));

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0].billable).toBe(false);
  });

  it("devolve a recorrência já aparada, com os campos de dia único nulos", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dias: [1, 3, 6] }));

    const { drafts } = await planWeek({ llm }, makeOptions());

    expect(drafts[0]).toMatchObject({
      scheduleType: "recurring",
      recurringDays: [1, 3],
      scheduleDate: null,
    });
  });

  it("devolve drafts vazio quando a resposta não traz plano legível", async () => {
    // Não há erro tipado para isto: erro de provedor é de `infra/`, e "respondeu
    // mas não com um plano" não é falha de transporte. Quem escreve a frase na
    // tela é a apresentação.
    const { drafts } = await planWeek({ llm: makeLlm("Desculpe, não entendi.") }, makeOptions());

    expect(drafts).toEqual([]);
  });

  it("conta o que o parser descartou", async () => {
    const llm = makeLlm(
      reply({ nome: "Alinhamento", dia: "2026-09-02" }, { nome: "Feira", dias: [6] })
    );

    const { drafts, discarded } = await planWeek({ llm }, makeOptions());

    expect(drafts).toHaveLength(1);
    expect(discarded).toBe(1);
  });

  it("sobe a cota que a chamada mediu", async () => {
    const llm = makeLlm(reply({ nome: "Alinhamento", dia: "2026-09-02" }), {
      requestsLimit: 1000,
      requestsRemaining: 998,
    });

    const { limits } = await planWeek({ llm }, makeOptions());

    expect(limits).toEqual({ requestsLimit: 1000, requestsRemaining: 998 });
  });

  it("propaga o erro do provedor sem traduzir", async () => {
    const error = new Error("Rate limit reached");
    error.name = LLM_RATE_LIMIT_ERROR_NAME;
    const llm: ILlmApi = {
      complete: vi.fn(async () => {
        throw error;
      }),
      listModels: vi.fn(async () => []),
    };

    await expect(planWeek({ llm }, makeOptions())).rejects.toBe(error);
  });

  it("manda ao modelo os nomes do catálogo e o pedido", async () => {
    const llm = makeLlm(reply());

    await planWeek({ llm }, makeOptions({ request: "sexta, revisar PRs" }));

    const [messages] = vi.mocked(llm.complete).mock.calls[0];
    expect(messages[1].content).toContain("DeskClock");
    expect(messages[1].content).toContain("Reunião");
    expect(messages[1].content).toContain("sexta, revisar PRs");
  });
});
