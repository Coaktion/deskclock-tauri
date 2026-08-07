import { describe, it, expect, vi } from "vitest";
import { resolveMeetingTaskDefaults } from "@domain/usecases/calendar/resolveMeetingTaskDefaults";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";

const TODAY = "2026-08-07";
const ACTIVE_WS = "ws-monday";
const OTHER_WS = "ws-planilha";

function makePlanned(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: ACTIVE_WS,
    name: "Aktie Now - Daily",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    scheduleType: "recurring",
    scheduleDate: null,
    recurringDays: [1, 2, 3, 4, 5],
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-08-01T00:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

function makeRepo(linked: PlannedTask | null, sameDay: PlannedTask[] = []) {
  return {
    findById: vi.fn(async () => linked),
    findForDate: vi.fn(async () => sameDay),
    save: vi.fn(),
    update: vi.fn(),
    findForWeek: vi.fn(),
    complete: vi.fn(),
    uncomplete: vi.fn(),
    reorder: vi.fn(),
    delete: vi.fn(),
  } as unknown as IPlannedTaskRepository & {
    findById: ReturnType<typeof vi.fn>;
    findForDate: ReturnType<typeof vi.fn>;
  };
}

const input = (overrides: Partial<Parameters<typeof resolveMeetingTaskDefaults>[1]> = {}) => ({
  title: "Aktie Now - Daily",
  plannedTaskId: "pt-1",
  todayISO: TODAY,
  workspaceId: ACTIVE_WS,
  ...overrides,
});

describe("resolveMeetingTaskDefaults", () => {
  it("herda da planejada vinculada quando ela é do workspace ativo", async () => {
    const repo = makeRepo(makePlanned());

    const defaults = await resolveMeetingTaskDefaults(repo, input());

    expect(defaults).toEqual({
      projectId: "proj-1",
      categoryId: "cat-1",
      billable: true,
      plannedTaskId: "pt-1",
      customValues: {},
    });
    // Vínculo bom não custa a segunda consulta.
    expect(repo.findForDate).not.toHaveBeenCalled();
  });

  it("leva os campos personalizados junto — é deles que vem o Project Stage", async () => {
    const repo = makeRepo(makePlanned({ customValues: { "cf-stage": "opt-7", "cf-obs": "x" } }));

    const defaults = await resolveMeetingTaskDefaults(repo, input());

    expect(defaults.customValues).toEqual({ "cf-stage": "opt-7", "cf-obs": "x" });
  });

  it("copia os campos personalizados, não a referência da planejada", async () => {
    const planned = makePlanned({ customValues: { "cf-stage": "opt-7" } });
    const repo = makeRepo(planned);

    const defaults = await resolveMeetingTaskDefaults(repo, input());
    defaults.customValues["cf-stage"] = "outro";

    expect(planned.customValues["cf-stage"]).toBe("opt-7");
  });

  it("leva os campos personalizados também pelo casamento por nome", async () => {
    const repo = makeRepo(makePlanned({ id: "pt-outro", workspaceId: OTHER_WS }), [
      makePlanned({ id: "pt-local", customValues: { "cf-stage": "opt-local" } }),
    ]);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: "pt-outro" }));

    expect(defaults.customValues).toEqual({ "cf-stage": "opt-local" });
  });

  it("herda mesmo com a planejada renomeada — o vínculo não depende do nome", async () => {
    const repo = makeRepo(makePlanned({ name: "Daily (novo nome)" }));

    const defaults = await resolveMeetingTaskDefaults(repo, input());

    expect(defaults.plannedTaskId).toBe("pt-1");
    expect(defaults.projectId).toBe("proj-1");
  });

  it("ignora o vínculo de outro workspace e cai na planejada de mesmo nome no ativo", async () => {
    // O sync vinculou a cópia do outro workspace (era o ativo na virada do dia).
    // Colar o projeto dela aqui gravaria um id que não existe no catálogo ativo,
    // e a tela mostraria projeto e categoria em branco.
    const repo = makeRepo(
      makePlanned({ id: "pt-outro", workspaceId: OTHER_WS, projectId: "proj-outro" }),
      [makePlanned({ id: "pt-local", projectId: "proj-local", categoryId: "cat-local" })]
    );

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: "pt-outro" }));

    expect(defaults).toEqual({
      projectId: "proj-local",
      categoryId: "cat-local",
      billable: true,
      plannedTaskId: "pt-local",
      customValues: {},
    });
    expect(repo.findForDate).toHaveBeenCalledWith(TODAY, ACTIVE_WS);
  });

  it("não herda nada quando a planejada só existe no outro workspace", async () => {
    const repo = makeRepo(makePlanned({ id: "pt-outro", workspaceId: OTHER_WS }), []);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: "pt-outro" }));

    // Nem o vínculo: gravá-lo faria a parada concluir a planejada do outro workspace.
    expect(defaults).toEqual({
      projectId: null,
      categoryId: null,
      billable: false,
      plannedTaskId: null,
      customValues: {},
    });
  });

  it("casa por nome quando não há vínculo nenhum", async () => {
    const repo = makeRepo(null, [makePlanned({ id: "pt-local" })]);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: null }));

    expect(defaults.plannedTaskId).toBe("pt-local");
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("casa por nome ignorando caixa e espaços nas pontas", async () => {
    const repo = makeRepo(null, [makePlanned({ id: "pt-local", name: "  aktie now - DAILY " })]);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: null }));

    expect(defaults.plannedTaskId).toBe("pt-local");
  });

  it("não casa por aproximação — nome diferente não herda nada", async () => {
    const repo = makeRepo(null, [
      makePlanned({ id: "pt-local", name: "Aktie Now - Daily (time)" }),
    ]);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: null }));

    expect(defaults.plannedTaskId).toBeNull();
    expect(defaults.projectId).toBeNull();
  });

  it("trata vínculo apagado como ausente e volta ao nome", async () => {
    const repo = makeRepo(null, [makePlanned({ id: "pt-local" })]);

    const defaults = await resolveMeetingTaskDefaults(repo, input({ plannedTaskId: "pt-sumida" }));

    expect(defaults.plannedTaskId).toBe("pt-local");
  });
});
