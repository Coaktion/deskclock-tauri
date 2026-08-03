import { describe, it, expect, vi } from "vitest";
import { listItemsOwnedBy } from "@domain/usecases/monday/listItemsOwnedBy";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { MondayItem } from "@shared/types/monday";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";

function mapping(
  mondayBoardId: string,
  personColumnId = "person",
  overrides: Partial<MondayProjectMapping> = {}
): MondayProjectMapping {
  return {
    deskclockProjectId: `p-${mondayBoardId}`,
    mondayBoardId,
    mondayBoardName: `Board ${mondayBoardId}`,
    activitiesGroupId: "group_activities",
    columnIds: {
      reportedHours: "numeric_mm33gj5m",
      billingType: "color_mm33rxm7",
      activityType: "color_mm19csp3",
      status: "status",
      person: personColumnId,
    },
    activityTypeLabels: [],
    projectStageLabels: [],
    projectStageTitle: "Project Stage",
    workspaceId: "ws-monday",
    ...overrides,
  };
}

function item(id: string, boardId: string): MondayItem {
  return {
    id,
    name: `Item ${id}`,
    url: `https://coaktion.monday.com/boards/${boardId}/pulses/${id}`,
    boardId,
    groupId: "g",
    groupTitle: "Timeline",
    createdAt: "2026-08-03T12:00:00Z",
    columnValues: [],
  };
}

/** Só `listItems` importa aqui; o resto da porta fica como stub. */
function makeApi(impl: IMondayApi["listItems"]) {
  const listItems = vi.fn(impl);
  return { api: { listItems } as unknown as IMondayApi, listItems };
}

describe("listItemsOwnedBy", () => {
  it("consulta todos os boards de uma vez quando a coluna de pessoa é a mesma", async () => {
    // É o caso real: os boards nascem do mesmo template.
    const { api, listItems } = makeApi(async (boardIds) =>
      boardIds.map((id) => item(`i-${id}`, id))
    );

    const items = await listItemsOwnedBy(api, [mapping("1"), mapping("2"), mapping("3")], "42");

    expect(listItems).toHaveBeenCalledTimes(1);
    expect(listItems).toHaveBeenCalledWith(["1", "2", "3"], {
      owner: { columnId: "person", personId: "42" },
    });
    expect(items).toHaveLength(3);
  });

  it("separa as consultas por coluna de pessoa", async () => {
    // A regra de responsável é única por consulta: board com outra coluna teria
    // de ser filtrado por uma regra que não existe naquele board.
    const { api, listItems } = makeApi(async () => []);

    await listItemsOwnedBy(
      api,
      [mapping("1"), mapping("2", "multiple_person_mm195stz"), mapping("3")],
      "42"
    );

    expect(listItems).toHaveBeenCalledTimes(2);
    expect(listItems.mock.calls[0][0]).toEqual(["1", "3"]);
    expect(listItems.mock.calls[1][0]).toEqual(["2"]);
    expect(listItems.mock.calls[1][1]).toMatchObject({
      owner: { columnId: "multiple_person_mm195stz", personId: "42" },
    });
  });

  it("traduz o escopo em regra de grupo e repassa as colunas", async () => {
    const { api, listItems } = makeApi(async () => []);

    await listItemsOwnedBy(api, [mapping("1")], "42", {
      scope: "outsideActivities",
      columnIds: ["color_mm19csp3"],
    });
    expect(listItems).toHaveBeenCalledWith(["1"], {
      excludeGroupIds: ["group_activities"],
      columnIds: ["color_mm19csp3"],
      owner: { columnId: "person", personId: "42" },
    });

    await listItemsOwnedBy(api, [mapping("1")], "42", { scope: "activities" });
    expect(listItems).toHaveBeenLastCalledWith(["1"], {
      groupIds: ["group_activities"],
      owner: { columnId: "person", personId: "42" },
    });
  });

  it("separa as consultas quando o id do grupo Activities difere entre boards", async () => {
    // Não é performance, é correção: o id de grupo se repete entre boards com
    // significados diferentes — `group_mm19wbff` é "Timeline" no board de
    // cliente e "Activities" no interno. Numa consulta só, a união dos ids
    // apagaria o Timeline de todo cliente.
    const { api, listItems } = makeApi(async () => []);
    const cliente = mapping("1", "person", { activitiesGroupId: "group_mm2e2g9j" });
    const outroCliente = mapping("2", "person", { activitiesGroupId: "group_mm2e2g9j" });
    const interno = mapping("3", "person", { activitiesGroupId: "group_mm19wbff" });

    await listItemsOwnedBy(api, [cliente, outroCliente, interno], "42", {
      scope: "outsideActivities",
    });

    expect(listItems).toHaveBeenCalledTimes(2);
    expect(listItems.mock.calls[0][0]).toEqual(["1", "2"]);
    expect(listItems.mock.calls[0][1]).toMatchObject({ excludeGroupIds: ["group_mm2e2g9j"] });
    expect(listItems.mock.calls[1][0]).toEqual(["3"]);
    expect(listItems.mock.calls[1][1]).toMatchObject({ excludeGroupIds: ["group_mm19wbff"] });
  });

  it("não consulta nada sem mapeamento ou sem usuário", async () => {
    // Sem o id do usuário a busca traria o board do time inteiro.
    const { api, listItems } = makeApi(async () => []);

    expect(await listItemsOwnedBy(api, [], "42")).toEqual([]);
    expect(await listItemsOwnedBy(api, [mapping("1")], "")).toEqual([]);
    expect(listItems).not.toHaveBeenCalled();
  });
});
