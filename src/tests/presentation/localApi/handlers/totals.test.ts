import { describe, it, expect } from "vitest";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

describe("totals.period", () => {
  it("soma só as concluídas de hoje no workspace ativo", async () => {
    const deps = makeDeps();
    deps.taskRepo.findByDateRange.mockResolvedValue([
      makeTask({ id: "a", status: "completed", durationSeconds: 3600, billable: true }),
      makeTask({ id: "b", status: "completed", durationSeconds: 600, billable: false }),
      makeTask({ id: "rodando", durationSeconds: 999 }),
    ]);
    const result = await dispatchLocalApiRequest(deps, "totals.period", {});
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO(TODAY),
      endOfDayISO(TODAY),
      WS_ATIVO
    );
    expect(result).toEqual({
      status: 200,
      body: {
        from: TODAY,
        to: TODAY,
        totalSeconds: 4200,
        billableSeconds: 3600,
        nonBillableSeconds: 600,
        count: 2,
      },
    });
  });

  it("usa o período e o workspace informados; 400 e 409 nos inválidos", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "totals.period", {
      from: "2026-09-01",
      to: "2026-09-10",
      workspaceId: WS_OUTRO,
    });
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-09-01"),
      endOfDayISO("2026-09-10"),
      WS_OUTRO
    );
    expect((await dispatchLocalApiRequest(deps, "totals.period", { to: "ontem" })).status).toBe(
      400
    );
    expect(
      (await dispatchLocalApiRequest(deps, "totals.period", { workspaceId: "x" })).status
    ).toBe(409);
  });
});

describe("totals.week", () => {
  it("soma a semana de segunda a domingo do dia informado", async () => {
    const deps = makeDeps();
    deps.taskRepo.findByDateRange.mockResolvedValue([
      makeTask({ status: "completed", durationSeconds: 3600, startTime: localISO(2026, 9, 7, 22) }),
      makeTask({ status: "completed", durationSeconds: 1800, startTime: localISO(2026, 9, 9, 9) }),
    ]);
    const result = await dispatchLocalApiRequest(deps, "totals.week", {
      date: "2026-09-13",
      workspaceId: WS_OUTRO,
    });
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO("2026-09-07"),
      endOfDayISO("2026-09-13"),
      WS_OUTRO
    );
    expect(result).toEqual({
      status: 200,
      body: { weekStart: "2026-09-07", weekEnd: "2026-09-13", totalSeconds: 5400, daysWorked: 2 },
    });
  });

  it("sem data usa a semana de hoje no workspace ativo; 400 para data inválida", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "totals.week", {});
    expect(result.body).toMatchObject({ weekStart: "2026-09-14", weekEnd: "2026-09-20" });
    expect(deps.taskRepo.findByDateRange.mock.calls[0][2]).toBe(WS_ATIVO);
    expect((await dispatchLocalApiRequest(deps, "totals.week", { date: "13/09" })).status).toBe(
      400
    );
  });
});
