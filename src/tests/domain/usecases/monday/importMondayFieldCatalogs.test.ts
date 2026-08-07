import { describe, it, expect, vi } from "vitest";
import {
  importMondayFieldCatalogs,
  parseDropdownLabels,
  REPORT_CATALOG_COLUMN_IDS,
} from "@domain/usecases/monday/importMondayFieldCatalogs";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayBoardSchema, MondayColumn } from "@shared/types/monday";

const REPORT_BOARD = "18422834169";

/** `settings_str` de uma coluna `status`, como o Monday devolve. */
function statusColumn(id: string, labels: Record<string, string>): MondayColumn {
  return {
    id,
    title: id,
    type: "status",
    settingsStr: JSON.stringify({ labels, deactivated_labels: [] }),
  };
}

/** `settings_str` de uma coluna `dropdown` — formato diferente do `status`. */
function dropdownColumn(
  id: string,
  labels: { id: number; name: string }[],
  deactivated: number[] = []
): MondayColumn {
  return {
    id,
    title: id,
    type: "dropdown",
    settingsStr: JSON.stringify({ labels, deactivated_labels: deactivated }),
  };
}

function schema(columns: MondayColumn[]): MondayBoardSchema {
  return { id: REPORT_BOARD, name: "Report de Horas", groups: [], columns, views: [] };
}

function fullSchema(): MondayBoardSchema {
  return schema([
    statusColumn(REPORT_CATALOG_COLUMN_IDS.activityType, { "0": "Development", "1": "Meeting" }),
    statusColumn(REPORT_CATALOG_COLUMN_IDS.projectStage, { "0": "Kickoff", "1": "Go-live" }),
    statusColumn(REPORT_CATALOG_COLUMN_IDS.reportType, { "7": "Activity", "4": "Meeting" }),
    dropdownColumn(REPORT_CATALOG_COLUMN_IDS.nonBillableReason, [
      { id: 1, name: "Internal Planning" },
      { id: 2, name: "Execution Error" },
    ]),
  ]);
}

function makeApi(boardSchema: MondayBoardSchema): IMondayApi {
  return {
    getMe: vi.fn(),
    listBoardSchemas: vi.fn(),
    getBoardSchema: vi.fn(async () => boardSchema),
    listItems: vi.fn(),
    createItem: vi.fn(),
    changeColumnValues: vi.fn(),
    deleteItem: vi.fn(),
  } as unknown as IMondayApi;
}

describe("parseDropdownLabels", () => {
  it("lê o formato de array do dropdown, diferente do mapa do status", () => {
    const labels = parseDropdownLabels(
      dropdownColumn("d", [
        { id: 1, name: "Peer Technical Support" },
        { id: 2, name: "Non-billed PM" },
      ])
    );

    expect(labels).toEqual(["Peer Technical Support", "Non-billed PM"]);
  });

  it("descarta rótulo desativado", () => {
    // Rótulo desativado não pode ser escrito na coluna, e o Monday recusa a
    // mutation inteira quando um valor inválido chega — a mesma razão pela qual
    // o envio só manda rótulo que existe no board.
    const labels = parseDropdownLabels(
      dropdownColumn(
        "d",
        [
          { id: 1, name: "Vivo" },
          { id: 2, name: "Morto" },
        ],
        [2]
      )
    );

    expect(labels).toEqual(["Vivo"]);
  });

  it("apara as pontas e descarta rótulo vazio", () => {
    const labels = parseDropdownLabels(
      dropdownColumn("d", [
        { id: 1, name: "  Internal Planning  " },
        { id: 2, name: "   " },
      ])
    );

    expect(labels).toEqual(["Internal Planning"]);
  });

  it("devolve vazio para coluna ausente ou settings ilegível", () => {
    expect(parseDropdownLabels(undefined)).toEqual([]);
    expect(parseDropdownLabels({ id: "d", title: "d", type: "dropdown" })).toEqual([]);
    expect(
      parseDropdownLabels({ id: "d", title: "d", type: "dropdown", settingsStr: "{oops" })
    ).toEqual([]);
  });
});

describe("importMondayFieldCatalogs", () => {
  it("lê os quatro catálogos numa consulta só", async () => {
    const api = makeApi(fullSchema());

    const catalogs = await importMondayFieldCatalogs({ api, reportBoardId: REPORT_BOARD });

    expect(catalogs).toEqual({
      activityType: ["Development", "Meeting"],
      projectStage: ["Kickoff", "Go-live"],
      nonBillableReason: ["Internal Planning", "Execution Error"],
      // A ordem sai do id do rótulo (a chave do mapa), não da posição visual no
      // board — é como `parseStatusLabels` já entrega os rótulos desde a Fase 1.
      reportType: ["Meeting", "Activity"],
    });
    expect(api.getBoardSchema).toHaveBeenCalledTimes(1);
    expect(api.getBoardSchema).toHaveBeenCalledWith(REPORT_BOARD);
  });

  it("coluna ausente vira catálogo vazio, sem derrubar os outros", async () => {
    const api = makeApi(
      schema([statusColumn(REPORT_CATALOG_COLUMN_IDS.activityType, { "0": "Development" })])
    );

    const catalogs = await importMondayFieldCatalogs({ api, reportBoardId: REPORT_BOARD });

    expect(catalogs.activityType).toEqual(["Development"]);
    expect(catalogs.projectStage).toEqual([]);
    expect(catalogs.nonBillableReason).toEqual([]);
    expect(catalogs.reportType).toEqual([]);
  });

  it("descarta o rótulo em branco que o board de Report guarda no Project Stage", async () => {
    // O `color_mm3ajr7s` real tem 18 rótulos, um deles vazio: ele viraria uma
    // opção sem nome no campo personalizado.
    const api = makeApi(
      schema([statusColumn(REPORT_CATALOG_COLUMN_IDS.projectStage, { "0": "Kickoff", "5": "" })])
    );

    const catalogs = await importMondayFieldCatalogs({ api, reportBoardId: REPORT_BOARD });

    expect(catalogs.projectStage).toEqual(["Kickoff"]);
  });

  it("exige o id do board", async () => {
    const api = makeApi(fullSchema());

    await expect(importMondayFieldCatalogs({ api, reportBoardId: "" })).rejects.toThrow();
    expect(api.getBoardSchema).not.toHaveBeenCalled();
  });
});
