import { describe, it, expect } from "vitest";
import {
  buildActivityColumnValues,
  buildActivityDateColumns,
  secondsToDecimalHours,
  serializeNumber,
  serializePerson,
  serializeStatus,
  MONDAY_BILLABLE_LABEL,
  MONDAY_NON_BILLABLE_LABEL,
  MONDAY_COMPLETED_LABEL,
} from "@domain/usecases/monday/buildActivityColumnValues";
import type { MondayActivityColumnIds } from "@shared/types/mondayConfig";

// `satisfies` em vez de anotação: com Billing type, Status e Project Stage
// opcionais no tipo, anotar tornaria `COLUMNS.status` um `string | undefined` e
// as asserções abaixo não poderiam indexar por ele.
const COLUMNS = {
  reportedHours: "numeric_mm33gj5m",
  billingType: "color_mm33rxm7",
  activityType: "color_mm19csp3",
  projectStage: "color_mm19zrwg",
  status: "status",
  person: "person",
} satisfies MondayActivityColumnIds;

describe("serializadores de coluna do Monday", () => {
  it("serializa numbers como string", () => {
    expect(serializeNumber(1.83)).toBe("1.83");
  });

  it("serializa status pelo rótulo visível", () => {
    expect(serializeStatus("Development")).toEqual({ label: "Development" });
  });

  it("serializa people no formato personsAndTeams com id numérico", () => {
    expect(serializePerson("21181483")).toEqual({
      personsAndTeams: [{ id: 21181483, kind: "person" }],
    });
  });
});

describe("secondsToDecimalHours", () => {
  it("converte segundos em horas decimais com 2 casas", () => {
    expect(secondsToDecimalHours(6600)).toBe(1.83);
  });

  it("retorna 0 para duração zero", () => {
    expect(secondsToDecimalHours(0)).toBe(0);
  });

  it("arredonda para cima na terceira casa", () => {
    expect(secondsToDecimalHours(3599)).toBe(1);
  });
});

describe("buildActivityColumnValues", () => {
  it("monta as colunas obrigatórias de uma atividade billable", () => {
    const values = buildActivityColumnValues({
      columnIds: COLUMNS,
      hoursDecimal: 1.83,
      billable: true,
      userId: "21181483",
    });

    expect(values).toEqual({
      [COLUMNS.reportedHours]: "1.83",
      [COLUMNS.billingType]: { label: MONDAY_BILLABLE_LABEL },
      [COLUMNS.status]: { label: MONDAY_COMPLETED_LABEL },
      [COLUMNS.person]: { personsAndTeams: [{ id: 21181483, kind: "person" }] },
    });
  });

  it("usa o rótulo Non Billable quando a tarefa não é faturável", () => {
    const values = buildActivityColumnValues({
      columnIds: COLUMNS,
      hoursDecimal: 0.5,
      billable: false,
      userId: "1",
    });

    expect(values[COLUMNS.billingType]).toEqual({ label: MONDAY_NON_BILLABLE_LABEL });
  });

  it("inclui Activity Type e Project Stage quando há mapeamento", () => {
    const values = buildActivityColumnValues({
      columnIds: COLUMNS,
      hoursDecimal: 2,
      billable: true,
      userId: "1",
      activityTypeLabel: "Development",
      projectStageLabel: "Execução",
    });

    expect(values[COLUMNS.activityType]).toEqual({ label: "Development" });
    expect(values[COLUMNS.projectStage]).toEqual({ label: "Execução" });
  });

  it("omite Project Stage quando o board não tem a coluna", () => {
    const withoutStage: MondayActivityColumnIds = { ...COLUMNS };
    delete withoutStage.projectStage;
    const values = buildActivityColumnValues({
      columnIds: withoutStage,
      hoursDecimal: 2,
      billable: true,
      userId: "1",
      projectStageLabel: "Execução",
    });

    expect(Object.keys(values)).not.toContain("color_mm19zrwg");
  });

  it("omite Billing type e Status quando o board não tem as colunas", () => {
    // O board fora do template deixou de ser recusado na importação, então ele
    // chega aqui. Mandar o id assim mesmo faria o Monday recusar a mutation
    // inteira — e o "não existe" da resposta é lido pelo sender como item
    // apagado, que responde recriando: duplicaria a atividade a cada ciclo.
    const minimal: MondayActivityColumnIds = {
      reportedHours: COLUMNS.reportedHours,
      activityType: COLUMNS.activityType,
      person: COLUMNS.person,
    };

    const values = buildActivityColumnValues({
      columnIds: minimal,
      hoursDecimal: 1.5,
      billable: true,
      userId: "1",
      statusLabel: "Working on it",
      activityTypeLabel: "Development",
    });

    expect(values).toEqual({
      [COLUMNS.reportedHours]: "1.5",
      [COLUMNS.activityType]: { label: "Development" },
      [COLUMNS.person]: { personsAndTeams: [{ id: 1, kind: "person" }] },
    });
  });

  it("grava Start Date e End Date com o intervalo trabalhado, em UTC", () => {
    const values = buildActivityDateColumns(
      { ...COLUMNS, startDate: "date_mm33tthy", endDate: "date_mm33zcmr" },
      "2026-07-28T12:00:00.000Z",
      "2026-07-28T14:30:15.000Z"
    );

    // O Monday guarda a coluna `date` em UTC e exibe no fuso da conta; mandar a
    // hora local deslocaria o horário exibido.
    expect(values).toEqual({
      date_mm33tthy: { date: "2026-07-28", time: "12:00:00" },
      date_mm33zcmr: { date: "2026-07-28", time: "14:30:15" },
    });
  });

  it("omite as datas quando o board não tem as colunas", () => {
    expect(
      buildActivityDateColumns(COLUMNS, "2026-07-31T18:05:09.000Z", "2026-07-31T19:05:09.000Z")
    ).toEqual({});
  });

  it("permite sobrescrever o status final", () => {
    const values = buildActivityColumnValues({
      columnIds: COLUMNS,
      hoursDecimal: 1,
      billable: true,
      userId: "1",
      statusLabel: "Working on it",
    });

    expect(values[COLUMNS.status]).toEqual({ label: "Working on it" });
  });
});
