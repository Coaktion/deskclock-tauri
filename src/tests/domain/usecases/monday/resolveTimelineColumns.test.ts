import { describe, it, expect, vi } from "vitest";
import { resolveTimelineByBoard } from "@domain/usecases/monday/resolveTimelineColumns";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayBoardSchema } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

function schema(id: string, timelineTitle?: string): MondayBoardSchema {
  return {
    id,
    name: `Board ${id}`,
    groups: [],
    columns: [
      { id: "col_actual", title: "Actual Timeline", type: "timeline" },
      ...(timelineTitle ? [{ id: `tl_${id}`, title: timelineTitle, type: "timeline" }] : []),
    ],
    views: [],
  };
}

function mapping(overrides: Partial<MondayProjectMapping>): MondayProjectMapping {
  return {
    deskclockProjectId: "p1",
    portfolioItemId: "i1",
    mondayBoardId: "b1",
    mondayBoardName: "Board b1",
    scope: "cliente",
    activitiesGroupId: "group_act",
    reportTypeGroupIds: { Activity: "group_act" },
    columnIds: { reportedHours: "h", activityType: "a", person: "p" },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "",
    nonBillableReasonLabels: [],
    ...overrides,
  };
}

function makeApi(schemas: MondayBoardSchema[] = []): IMondayApi {
  return {
    listBoardSchemas: vi.fn(async (ids: string[]) => schemas.filter((s) => ids.includes(s.id))),
  } as unknown as IMondayApi;
}

describe("resolveTimelineByBoard", () => {
  it("não fala com o Monday quando todo board já tem o id cacheado", async () => {
    const api = makeApi();

    const result = await resolveTimelineByBoard(api, [
      mapping({ mondayBoardId: "b1", timelineColumnId: "tl_b1" }),
      mapping({ mondayBoardId: "b2", timelineColumnId: "tl_b2" }),
    ]);

    expect(api.listBoardSchemas).not.toHaveBeenCalled();
    expect(result.get("b1")).toBe("tl_b1");
    expect(result.get("b2")).toBe("tl_b2");
  });

  // `""` é resposta, não ausência: o board foi lido e não tem cronograma. Tratá-lo
  // como "não sei" faria esses boards pagarem a leitura do schema para sempre.
  it("entende string vazia como board sem cronograma, sem reler o schema", async () => {
    const api = makeApi();

    const result = await resolveTimelineByBoard(api, [
      mapping({ mondayBoardId: "b1", timelineColumnId: "" }),
    ]);

    expect(api.listBoardSchemas).not.toHaveBeenCalled();
    expect(result.get("b1")).toBeUndefined();
  });

  it("lê o schema só dos boards sem cache — o vínculo de uma versão anterior", async () => {
    const api = makeApi([schema("b2", "Timeline")]);

    const result = await resolveTimelineByBoard(api, [
      mapping({ mondayBoardId: "b1", timelineColumnId: "tl_b1" }),
      mapping({ mondayBoardId: "b2" }),
    ]);

    expect(api.listBoardSchemas).toHaveBeenCalledWith(["b2"]);
    expect(result.get("b1")).toBe("tl_b1");
    expect(result.get("b2")).toBe("tl_b2");
  });

  // O template traz várias colunas `timeline`, e a "Actual Timeline" é a
  // realizada: pegar a primeira importaria o cronograma errado sem erro nenhum.
  it("resolve pelo título, não pelo primeiro timeline do board", async () => {
    const api = makeApi([schema("b1", "Cronograma")]);

    const result = await resolveTimelineByBoard(api, [mapping({ mondayBoardId: "b1" })]);

    expect(result.get("b1")).toBe("tl_b1");
  });

  it("deixa sem cronograma o board que a leitura não devolveu", async () => {
    const api = makeApi([]);

    const result = await resolveTimelineByBoard(api, [mapping({ mondayBoardId: "b-sumido" })]);

    expect(result.get("b-sumido")).toBeUndefined();
  });

  it("ignora projeto sem quadro de destino", async () => {
    const api = makeApi();

    const result = await resolveTimelineByBoard(api, [mapping({ mondayBoardId: "" })]);

    expect(api.listBoardSchemas).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
