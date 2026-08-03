import { describe, it, expect, vi, beforeEach } from "vitest";
import { importMondayItems } from "@domain/usecases/monday/importMondayItems";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { MondayItem } from "@shared/types/monday";

const WORKSPACE_ID = "ws-1";
const NOW_ISO = "2026-07-31T15:00:00.000Z";

function makeRepo() {
  const saved: PlannedTask[] = [];
  const repo = {
    save: vi.fn(async (task: PlannedTask) => {
      saved.push(task);
    }),
    update: vi.fn(),
    findById: vi.fn(),
    findForDate: vi.fn(),
    findForWeek: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
  } as unknown as IPlannedTaskRepository;
  return { repo, saved };
}

function item(overrides: Partial<MondayItem> = {}): MondayItem {
  return {
    id: "12664376489",
    name: "Status Report (weekly)",
    url: "https://coaktion.monday.com/boards/1/pulses/12664376489",
    boardId: "18423999320",
    groupId: "group_mm19wbff",
    groupTitle: "Timeline",
    createdAt: "2026-07-29T18:40:31Z",
    columnValues: [],
    ...overrides,
  };
}

describe("importMondayItems", () => {
  let ctx: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    ctx = makeRepo();
  });

  it("cria uma tarefa por item selecionado e devolve a contagem", async () => {
    const count = await importMondayItems(
      ctx.repo,
      [
        { item: item(), projectId: "p1", categoryId: "c1", billable: true, period: null },
        {
          item: item({ id: "2" }),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: null,
        },
      ],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(count).toBe(2);
    expect(ctx.saved).toHaveLength(2);
    expect(ctx.saved[0]).toMatchObject({
      workspaceId: WORKSPACE_ID,
      name: "Status Report (weekly)",
      projectId: "p1",
      categoryId: "c1",
      billable: true,
    });
  });

  it("não toca no repositório quando nada foi selecionado", async () => {
    const count = await importMondayItems(ctx.repo, [], NOW_ISO, WORKSPACE_ID);

    expect(count).toBe(0);
    expect(ctx.repo.save).not.toHaveBeenCalled();
  });

  it("timeline de um dia vira specific_date naquele dia", async () => {
    await importMondayItems(
      ctx.repo,
      [
        {
          item: item(),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: { startDayISO: "2026-07-16", endDayISO: "2026-07-16" },
        },
      ],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(ctx.saved[0]).toMatchObject({
      scheduleType: "specific_date",
      scheduleDate: "2026-07-16",
      periodStart: null,
      periodEnd: null,
    });
  });

  it("timeline de vários dias vira period, com as duas pontas", async () => {
    await importMondayItems(
      ctx.repo,
      [
        {
          item: item(),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: { startDayISO: "2026-07-23", endDayISO: "2026-08-18" },
        },
      ],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(ctx.saved[0]).toMatchObject({
      scheduleType: "period",
      scheduleDate: null,
      periodStart: "2026-07-23",
      periodEnd: "2026-08-18",
    });
  });

  it("item sem timeline cai no dia corrente, para não nascer invisível", async () => {
    const d = new Date(NOW_ISO);
    const pad = (n: number) => String(n).padStart(2, "0");
    const today = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    await importMondayItems(
      ctx.repo,
      [{ item: item(), projectId: "p1", categoryId: null, billable: false, period: null }],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(ctx.saved[0]).toMatchObject({ scheduleType: "specific_date", scheduleDate: today });
  });

  it("adiciona a ação de abrir o item só quando pedida", async () => {
    await importMondayItems(
      ctx.repo,
      [{ item: item(), projectId: "p1", categoryId: null, billable: false, period: null }],
      NOW_ISO,
      WORKSPACE_ID,
      true
    );
    await importMondayItems(
      ctx.repo,
      [
        {
          item: item({ id: "2" }),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: null,
        },
      ],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(ctx.saved[0].actions).toEqual([
      { type: "open_url", value: "https://coaktion.monday.com/boards/1/pulses/12664376489" },
    ]);
    expect(ctx.saved[1].actions).toEqual([]);
  });

  it("grava os campos personalizados escolhidos — o Project Stage entre eles", async () => {
    // O Monday exige a etapa no envio das horas: importar sem ela é adiar um
    // preenchimento que ninguém faz depois.
    await importMondayItems(
      ctx.repo,
      [
        {
          item: item(),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: null,
          customValues: { "field-stage": "option-dev" },
        },
        {
          item: item({ id: "2" }),
          projectId: "p1",
          categoryId: null,
          billable: false,
          period: null,
        },
      ],
      NOW_ISO,
      WORKSPACE_ID
    );

    expect(ctx.saved[0].customValues).toEqual({ "field-stage": "option-dev" });
    expect(ctx.saved[1].customValues).toEqual({});
  });
});
