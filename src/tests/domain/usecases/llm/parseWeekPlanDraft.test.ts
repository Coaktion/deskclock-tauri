import { describe, expect, it } from "vitest";

import { MAX_PLAN_TASKS, parseWeekPlanDraft } from "@domain/usecases/llm/parseWeekPlanDraft";

const WEEK = ["2026-08-31", "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"];

/** Uma resposta com as tarefas dadas, no formato que o prompt combina. */
function answer(...tasks: unknown[]): string {
  return JSON.stringify({ tarefas: tasks });
}

function parse(raw: string) {
  return parseWeekPlanDraft(raw, WEEK);
}

describe("parseWeekPlanDraft", () => {
  describe("extração", () => {
    it("lê a resposta limpa", () => {
      const { tasks } = parse(answer({ nome: "Revisar PRs", dia: "2026-09-04" }));
      expect(tasks).toEqual([
        { name: "Revisar PRs", scheduleType: "specific_date", scheduleDate: "2026-09-04" },
      ]);
    });

    it("apara a cerca de markdown", () => {
      const raw = "```json\n" + answer({ nome: "Revisar PRs", dia: "2026-09-04" }) + "\n```";
      expect(parse(raw).tasks).toHaveLength(1);
    });

    it("ignora prosa antes e depois do JSON", () => {
      const raw = `Claro! Aqui está o plano:\n${answer({ nome: "Revisar PRs", dia: "2026-09-04" })}\nEspero ter ajudado.`;
      expect(parse(raw).tasks).toHaveLength(1);
    });

    it("aceita a lista na raiz, sem o objeto em volta", () => {
      const raw = JSON.stringify([{ nome: "Revisar PRs", dia: "2026-09-04" }]);
      expect(parse(raw).tasks).toHaveLength(1);
    });

    it("aceita a lista sob outro nome de chave", () => {
      // O modelo às vezes embrulha em "plano" ou "items". A lista é uma só.
      const raw = JSON.stringify({ plano: [{ nome: "Revisar PRs", dia: "2026-09-04" }] });
      expect(parse(raw).tasks).toHaveLength(1);
    });

    it("devolve lista vazia quando não há JSON nenhum", () => {
      expect(parse("Desculpe, não entendi o pedido.")).toEqual({ tasks: [], discarded: 0 });
    });

    it("devolve lista vazia quando o JSON está quebrado", () => {
      expect(parse('{"tarefas": [{"nome": "Revisar}').tasks).toEqual([]);
    });

    it("não se perde com chave e colchete dentro de string", () => {
      const { tasks } = parse(answer({ nome: "Revisar [PRs] do {backend}", dia: "2026-09-04" }));
      expect(tasks[0].name).toBe("Revisar [PRs] do {backend}");
    });
  });

  describe("descarte por item", () => {
    it("descarta o item sem nome, e mantém os outros", () => {
      const { tasks, discarded } = parse(
        answer(
          { dia: "2026-09-04" },
          { nome: "   ", dia: "2026-09-04" },
          { nome: "Revisar PRs", dia: "2026-09-04" }
        )
      );
      expect(tasks.map((task) => task.name)).toEqual(["Revisar PRs"]);
      expect(discarded).toBe(2);
    });

    it("descarta o dia que não é da semana", () => {
      const { tasks, discarded } = parse(answer({ nome: "Revisar PRs", dia: "2026-09-11" }));
      expect(tasks).toEqual([]);
      expect(discarded).toBe(1);
    });

    it("descarta o item sem dia e sem dias", () => {
      expect(parse(answer({ nome: "Revisar PRs" })).tasks).toEqual([]);
    });

    it("apara sábado e domingo da recorrência", () => {
      const { tasks } = parse(answer({ nome: "Alinhamento", dias: [0, 1, 3, 6] }));
      expect(tasks[0]).toMatchObject({ scheduleType: "recurring", recurringDays: [1, 3] });
    });

    it("descarta a recorrência que só tinha fim de semana", () => {
      const { tasks, discarded } = parse(answer({ nome: "Feira", dias: [0, 6] }));
      expect(tasks).toEqual([]);
      expect(discarded).toBe(1);
    });

    it("ordena e desduplica os dias da recorrência", () => {
      const { tasks } = parse(answer({ nome: "Alinhamento", dias: [3, 1, 3] }));
      expect(tasks[0].recurringDays).toEqual([1, 3]);
    });

    it("com dia e dias juntos, o dia ganha", () => {
      const { tasks } = parse(answer({ nome: "Alinhamento", dia: "2026-09-02", dias: [1, 3] }));
      expect(tasks[0]).toEqual({
        name: "Alinhamento",
        scheduleType: "specific_date",
        scheduleDate: "2026-09-02",
      });
    });

    it("dia fora da semana descarta o item, mesmo havendo dias", () => {
      // O modelo que mandou os dois já se contradisse. Cair na recorrência
      // ressuscitaria um item que ele próprio colocou fora da semana.
      const { tasks } = parse(answer({ nome: "Alinhamento", dia: "2026-09-11", dias: [1, 3] }));
      expect(tasks).toEqual([]);
    });

    it("corta no vigésimo item e conta o resto como descartado", () => {
      const many = Array.from({ length: MAX_PLAN_TASKS + 3 }, (_, i) => ({
        nome: `Tarefa ${i}`,
        dia: "2026-09-04",
      }));
      const { tasks, discarded } = parse(answer(...many));
      expect(tasks).toHaveLength(MAX_PLAN_TASKS);
      expect(discarded).toBe(3);
    });
  });

  describe("campos opcionais", () => {
    it("mantém projeto e categoria como nome, sem resolver nada", () => {
      const { tasks } = parse(
        answer({ nome: "Alinhamento", dia: "2026-09-02", projeto: "Aktie", categoria: "Reunião" })
      );
      expect(tasks[0]).toMatchObject({ projectName: "Aktie", categoryName: "Reunião" });
    });

    it("ignora projeto e categoria vazios ou que não são texto", () => {
      const { tasks } = parse(answer({ nome: "Alinhamento", dia: "2026-09-02", projeto: "  " }));
      expect(tasks[0].projectName).toBeUndefined();
    });

    it("aceita faturavel só quando é booleano", () => {
      const { tasks } = parse(
        answer(
          { nome: "A", dia: "2026-09-02", faturavel: true },
          { nome: "B", dia: "2026-09-02", faturavel: "sim" }
        )
      );
      expect(tasks[0].billable).toBe(true);
      expect(tasks[1].billable).toBeUndefined();
    });

    it("aceita hora em HH:MM e completa a hora de um dígito", () => {
      const { tasks } = parse(
        answer({ nome: "Alinhamento", dia: "2026-09-02", inicio: "9:00", fim: "09:30" })
      );
      expect(tasks[0]).toMatchObject({ startTime: "09:00", endTime: "09:30" });
    });

    it("descarta hora fora do formato sem descartar a tarefa", () => {
      const { tasks } = parse(
        answer({ nome: "Alinhamento", dia: "2026-09-02", inicio: "manhã", fim: "25:00" })
      );
      expect(tasks[0].name).toBe("Alinhamento");
      expect(tasks[0].startTime).toBeUndefined();
      expect(tasks[0].endTime).toBeUndefined();
    });

    it("descarta o fim que veio sem início", () => {
      const { tasks } = parse(answer({ nome: "Alinhamento", dia: "2026-09-02", fim: "09:30" }));
      expect(tasks[0].endTime).toBeUndefined();
    });
  });
});
