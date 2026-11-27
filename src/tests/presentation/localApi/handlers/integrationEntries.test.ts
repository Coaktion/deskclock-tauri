import { describe, it, expect, vi } from "vitest";
import type { ClockifyTimeEntryFull } from "@shared/types/clockify";
import type { MondayEntry } from "@domain/usecases/monday/mondayEntries";
import { localISO } from "../../../helpers/localTime";

const loadMondayEntries = vi.fn();
vi.mock("@domain/usecases/monday/mondayEntries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@domain/usecases/monday/mondayEntries")>()),
  loadMondayEntries: (...args: unknown[]) => loadMondayEntries(...args),
}));

const { dispatchLocalApiRequest } = await import("@presentation/localApi/dispatch");
const { makeDeps, TODAY } = await import("../fakeDeps");

function clockifyEntry(
  id: string,
  hour: number,
  end: boolean,
  tagIds: string[]
): ClockifyTimeEntryFull {
  return {
    id,
    description: `Apontamento ${id}`,
    projectId: "cp",
    tagIds,
    billable: true,
    timeInterval: {
      start: localISO(2026, 9, 15, hour),
      end: end ? localISO(2026, 9, 15, hour + 1) : null,
      duration: null,
    },
    project: { id: "cp", name: "Site", clientName: "ACME", color: "#ff0000" },
    tags: tagIds.map((t) => ({ id: t, name: `Tag ${t}` })),
  };
}

function clockifySetup(defaultTagIds: string[], notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  const api = {
    listTimeEntries: vi.fn(async () => [
      clockifyEntry("a", 9, true, ["t1"]),
      clockifyEntry("b", 11, true, []),
      clockifyEntry("c", 13, false, ["t1"]),
    ]),
  };
  deps.entries.clockify.mockReturnValue({
    notConfiguredMessage,
    api,
    workspaceId: "cw",
    workspaceName: "Empresa",
    userId: "cu",
    defaultTagIds,
  });
  return { deps, api };
}

describe("clockify.entries", () => {
  it("lista os do período por dia, sem o em andamento, com o filtro de tags padrão", async () => {
    const { deps, api } = clockifySetup(["t1"]);
    const res = await dispatchLocalApiRequest(deps, "clockify.entries", {});
    expect(res.status).toBe(200);
    expect(api.listTimeEntries.mock.calls[0].slice(0, 2)).toEqual(["cw", "cu"]);
    const body = res.body as {
      onlyDefaultTags: boolean;
      days: { date: string; totalSeconds: number; entries: Record<string, unknown>[] }[];
    };
    expect(body.onlyDefaultTags).toBe(true);
    expect(body.days).toHaveLength(1);
    expect(body.days[0].date).toBe(TODAY);
    expect(body.days[0].entries).toEqual([
      {
        id: "a",
        description: "Apontamento a",
        start: localISO(2026, 9, 15, 9),
        end: localISO(2026, 9, 15, 10),
        durationSeconds: 3600,
        billable: true,
        project: { id: "cp", name: "ACME - Site", color: "#ff0000" },
        tags: [{ id: "t1", name: "Tag t1" }],
      },
    ]);
  });

  it("onlyDefaultTags=false mostra todos os concluídos", async () => {
    const { deps } = clockifySetup(["t1"]);
    const res = await dispatchLocalApiRequest(deps, "clockify.entries", {
      onlyDefaultTags: "false",
    });
    const body = res.body as { days: { totalSeconds: number; entries: unknown[] }[] };
    expect(body.days[0].entries).toHaveLength(2);
    expect(body.days[0].totalSeconds).toBe(7200);
  });

  it("não configurado é 409 e não chama o Clockify; filtro malformado é 400", async () => {
    const off = clockifySetup([], "Configure o Clockify.");
    expect((await dispatchLocalApiRequest(off.deps, "clockify.entries", {})).status).toBe(409);
    expect(off.api.listTimeEntries).not.toHaveBeenCalled();
    const { deps } = clockifySetup([]);
    expect(
      (await dispatchLocalApiRequest(deps, "clockify.entries", { onlyDefaultTags: "sim" })).status
    ).toBe(400);
  });
});

function mondayEntry(itemId: string, day: string | null, hours: number): MondayEntry {
  return {
    boardId: "b1",
    boardName: "Board 1",
    itemId,
    name: `Atividade ${itemId}`,
    url: `https://x.monday.com/${itemId}`,
    hoursDecimal: hours,
    billable: false,
    activityTypeLabel: "Development",
    projectStageLabel: "",
    statusLabel: "Done",
    period: day ? { startDayISO: day, endDayISO: day } : null,
    mapping: {} as MondayEntry["mapping"],
  };
}

function mondaySetup(notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  deps.entries.monday.mockReturnValue({
    notConfiguredMessage,
    api: {},
    userId: "mu",
    mappings: [{ mondayBoardId: "b1" }],
  });
  loadMondayEntries.mockResolvedValue([
    mondayEntry("1", TODAY, 1.5),
    mondayEntry("2", "2026-09-10", 2),
    mondayEntry("3", "2026-08-01", 4),
  ]);
  return deps;
}

describe("monday.entries", () => {
  it("recorta pela janela (padrão 7 dias) e agrupa por dia", async () => {
    const deps = mondaySetup();
    const res = await dispatchLocalApiRequest(deps, "monday.entries", {});
    expect(res.status).toBe(200);
    const body = res.body as {
      period: string;
      from: string;
      totalHours: number;
      days: { date: string; entries: Record<string, unknown>[] }[];
    };
    expect(body.period).toBe("7days");
    expect(body.from).toBe("2026-09-09");
    expect(body.totalHours).toBe(3.5);
    expect(body.days.map((d) => d.date)).toEqual([TODAY, "2026-09-10"]);
    expect(body.days[0].entries[0]).toEqual({
      boardId: "b1",
      boardName: "Board 1",
      itemId: "1",
      name: "Atividade 1",
      url: "https://x.monday.com/1",
      hours: 1.5,
      billable: false,
      activityType: "Development",
      projectStage: null,
      status: "Done",
      period: { startDate: TODAY, endDate: TODAY },
    });
  });

  it("janela fora das quatro é 400; não configurado é 409", async () => {
    const deps = mondaySetup();
    expect((await dispatchLocalApiRequest(deps, "monday.entries", { period: "week" })).status).toBe(
      400
    );
    const off = mondaySetup("Conecte o Monday.");
    expect((await dispatchLocalApiRequest(off, "monday.entries", {})).status).toBe(409);
  });
});
