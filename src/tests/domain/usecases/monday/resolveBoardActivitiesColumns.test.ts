import { describe, it, expect } from "vitest";
import {
  resolveBoardActivitiesColumns,
  findTimelineColumnId,
  parseStatusLabels,
} from "@domain/usecases/monday/resolveBoardActivitiesColumns";
import type { MondayBoardSchema } from "@shared/types/monday";

function makeSchema(overrides: Partial<MondayBoardSchema> = {}): MondayBoardSchema {
  return {
    id: "b1",
    name: "[BR] Cliente Produto 01-999",
    groups: [
      { id: "group_mm19wbff", title: "Timeline" },
      { id: "group_mm2e2g9j", title: "Activities" },
    ],
    columns: [
      { id: "numeric_mm33gj5m", title: "Reported Hours", type: "numbers" },
      { id: "color_mm33rxm7", title: "Billing type", type: "status" },
      { id: "color_mm19csp3", title: "Activity Type", type: "status" },
      { id: "color_mm19zrwg", title: "Project Stage", type: "status" },
      { id: "status", title: "Status", type: "status" },
      { id: "person", title: "Owner", type: "people" },
    ],
    views: [
      { id: "270215505", name: "Activities", type: "table" },
      { id: "270215500", name: "Timeline", type: "table" },
    ],
    ...overrides,
  };
}

/** Colunas de data como o template as expõe, com título e id conhecidos. */
const DATE_COLUMNS = [
  { id: "date_mm33tthy", title: "Start Date", type: "date" },
  { id: "date_mm33zcmr", title: "End Date", type: "date" },
];

describe("resolveBoardActivitiesColumns", () => {
  it("resolve as colunas de data pelo título", () => {
    const schema = makeSchema({ columns: [...makeSchema().columns, ...DATE_COLUMNS] });

    const result = resolveBoardActivitiesColumns(schema);

    expect(result).toMatchObject({
      ok: true,
      columnIds: { startDate: "date_mm33tthy", endDate: "date_mm33zcmr" },
    });
  });

  it("cai no id do template quando o título da coluna de data é outro", () => {
    const schema = makeSchema({
      columns: [
        ...makeSchema().columns,
        { id: "date_mm33tthy", title: "Início previsto", type: "date" },
        { id: "date_mm33zcmr", title: "Término previsto", type: "date" },
      ],
    });

    const result = resolveBoardActivitiesColumns(schema);

    expect(result).toMatchObject({
      ok: true,
      columnIds: { startDate: "date_mm33tthy", endDate: "date_mm33zcmr" },
    });
  });

  it("omite as datas quando o board não tem as colunas", () => {
    // O id do template nunca é assumido às cegas: mandar coluna inexistente faz
    // o Monday recusar a escrita inteira.
    const result = resolveBoardActivitiesColumns(makeSchema());

    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.columnIds.startDate).toBeUndefined();
    expect(result.columnIds.endDate).toBeUndefined();
  });

  it("resolve grupo e colunas pelos títulos", () => {
    const result = resolveBoardActivitiesColumns(makeSchema());

    expect(result).toEqual({
      ok: true,
      activitiesGroupId: "group_mm2e2g9j",
      columnIds: {
        reportedHours: "numeric_mm33gj5m",
        billingType: "color_mm33rxm7",
        activityType: "color_mm19csp3",
        projectStage: "color_mm19zrwg",
        status: "status",
        person: "person",
      },
    });
  });

  it("resolve títulos com acento e caixa diferentes", () => {
    const schema = makeSchema({
      groups: [{ id: "g1", title: "ATIVIDADES" }],
      columns: [
        { id: "c1", title: "horas reportadas", type: "numbers" },
        { id: "c2", title: "Tipo de Cobrança", type: "status" },
        { id: "c3", title: "TIPO DE ATIVIDADE", type: "status" },
        { id: "c4", title: "status", type: "status" },
        { id: "c5", title: "Responsável", type: "people" },
      ],
    });

    const result = resolveBoardActivitiesColumns(schema);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.activitiesGroupId).toBe("g1");
      expect(result.columnIds.reportedHours).toBe("c1");
      expect(result.columnIds.projectStage).toBeUndefined();
    }
  });

  it("cai na view Activities quando nenhum grupo tem esse nome", () => {
    const schema = makeSchema({
      groups: [
        { id: "group_mm19wbff", title: "Cronograma" },
        { id: "group_mm2e2g9j", title: "Apontamentos" },
      ],
      views: [
        {
          id: "270215505",
          name: "Activities",
          type: "table",
          settingsStr: '{"rules":[{"columnId":"group","compareValue":["group_mm2e2g9j"]}]}',
        },
      ],
    });

    const result = resolveBoardActivitiesColumns(schema);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.activitiesGroupId).toBe("group_mm2e2g9j");
  });

  it("reporta o que falta quando o board não segue o template", () => {
    const schema = makeSchema({ groups: [], columns: [], views: [] });
    const result = resolveBoardActivitiesColumns(schema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toContain("grupo Activities");
      expect(result.missing).toContain("coluna Reported Hours");
      expect(result.missing).toContain("coluna de pessoa");
    }
  });

  it("Project Stage é opcional", () => {
    const schema = makeSchema({
      columns: makeSchema().columns.filter((c) => c.title !== "Project Stage"),
    });
    const result = resolveBoardActivitiesColumns(schema);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.columnIds.projectStage).toBeUndefined();
  });
});

describe("parseStatusLabels", () => {
  it("extrai os rótulos de uma coluna status", () => {
    const labels = parseStatusLabels({
      id: "color_mm19csp3",
      title: "Activity Type",
      type: "status",
      settingsStr: '{"labels":{"0":"Development","1":"Setup","2":"Meeting"}}',
    });

    expect(labels).toEqual(["Development", "Setup", "Meeting"]);
  });

  it("descarta rótulos vazios", () => {
    const labels = parseStatusLabels({
      id: "c",
      title: "t",
      type: "status",
      settingsStr: '{"labels":{"0":"Development","1":""}}',
    });

    expect(labels).toEqual(["Development"]);
  });

  it("retorna vazio para coluna sem settings ou com JSON inválido", () => {
    expect(parseStatusLabels(undefined)).toEqual([]);
    expect(parseStatusLabels({ id: "c", title: "t", type: "status" })).toEqual([]);
    expect(
      parseStatusLabels({ id: "c", title: "t", type: "status", settingsStr: "{oops" })
    ).toEqual([]);
  });
});

describe("findTimelineColumnId", () => {
  const timeline = (id: string, title: string) => ({ id, title, type: "timeline" });

  it("resolve a coluna de cronograma planejado pelo título", () => {
    const schema = makeSchema({
      columns: [timeline("timerange_mm19cah8", "Timeline")],
    });
    expect(findTimelineColumnId(schema)).toBe("timerange_mm19cah8");
  });

  it("ignora Actual Timeline e as baselines, mesmo vindo antes no board", () => {
    // O template real traz as quatro; pegar a primeira do tipo importaria o
    // cronograma realizado no lugar do planejado.
    const schema = makeSchema({
      columns: [
        timeline("timerange_mm2x7dx", "Actual Timeline"),
        timeline("timerange_mm5725c7", "Baseline of Actual Timeline (13 Jul '26)"),
        timeline("timerange_mm19cah8", "Timeline"),
        timeline("timerange_mm576p5s", "Baseline of Planned Timeline (13 Jul '26)"),
      ],
    });
    expect(findTimelineColumnId(schema)).toBe("timerange_mm19cah8");
  });

  it("aceita o título em português", () => {
    const schema = makeSchema({ columns: [timeline("t1", "Cronograma")] });
    expect(findTimelineColumnId(schema)).toBe("t1");
  });

  it("devolve undefined quando o board não tem a coluna", () => {
    const schema = makeSchema({ columns: [timeline("t1", "Actual Timeline")] });
    expect(findTimelineColumnId(schema)).toBeUndefined();
  });
});
