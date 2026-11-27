import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";

const taskRepo = {
  save: vi.fn(async () => undefined),
} as unknown as ITaskRepository;
const plannedTaskRepo = {
  complete: vi.fn(async () => undefined),
} as unknown as IPlannedTaskRepository;

vi.mock("@presentation/contexts/RepositoriesContext", () => ({
  useRepositories: () => ({ taskRepo, plannedTaskRepo }),
}));
vi.mock("@presentation/contexts/WorkspaceContext", () => ({
  useActiveWorkspaceId: () => "ws-1",
}));
vi.mock("@shared/utils/taskSync", () => ({ notifyTasksChanged: vi.fn(async () => undefined) }));

const DATE = "2026-09-14";

function planned(): PlannedTask {
  return {
    id: "pt-1",
    workspaceId: "ws-1",
    name: "Daily",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: DATE,
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-09-01T00:00:00Z",
    customValues: {},
  };
}

function renderForm(onTaskAdded = vi.fn(async () => undefined)) {
  return renderHook(() =>
    useRetroactiveForm({ selectedDate: DATE, projects: [], categories: [], onTaskAdded })
  );
}

describe("useRetroactiveForm — duração mínima", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fim igual ao início mostra a mensagem do domínio sem gravar nem concluir a planejada", async () => {
    const onTaskAdded = vi.fn(async () => undefined);
    const { result } = renderForm(onTaskAdded);
    act(() => result.current.prefill(planned()));

    await act(() => result.current.handleAdd(result.current.startTime));

    expect(result.current.error).toBe("A duração mínima é 1 minuto.");
    expect(result.current.saving).toBe(false);
    expect(taskRepo.save).not.toHaveBeenCalled();
    expect(plannedTaskRepo.complete).not.toHaveBeenCalled();
    expect(onTaskAdded).not.toHaveBeenCalled();
  });

  it("depois do erro, o mesmo prefill ainda conclui a planejada ao lançar válido", async () => {
    const { result } = renderForm();
    act(() => result.current.prefill(planned()));
    await act(() => result.current.handleAdd(result.current.startTime));

    await act(() => result.current.handleAdd());

    expect(result.current.error).toBe("");
    expect(taskRepo.save).toHaveBeenCalledTimes(1);
    expect(plannedTaskRepo.complete).toHaveBeenCalledWith("pt-1", DATE);
  });
});

describe("useRetroactiveForm — aba IA", () => {
  beforeEach(() => vi.clearAllMocks());

  const projects = [{ id: "p-1", name: "Tech interno" }] as unknown as Parameters<
    typeof useRetroactiveForm
  >[0]["projects"];
  const categories = [{ id: "c-1", name: "Development" }] as unknown as Parameters<
    typeof useRetroactiveForm
  >[0]["categories"];
  const what = {
    name: "Alinhamento sprint",
    projectId: "p-1",
    categoryId: "c-1",
    billable: false,
    customValues: { "f-1": "opt-1" },
  };

  function renderWithCatalog() {
    return renderHook(() =>
      useRetroactiveForm({
        selectedDate: DATE,
        projects,
        categories,
        onTaskAdded: vi.fn(async () => undefined),
      })
    );
  }

  it("applyInterpretation escreve o quê nos campos, com os nomes do catálogo", () => {
    const { result } = renderWithCatalog();

    act(() => result.current.applyInterpretation(what));

    expect(result.current.name).toBe("Alinhamento sprint");
    expect(result.current.projectName).toBe("Tech interno");
    expect(result.current.selectedProjectId).toBe("p-1");
    expect(result.current.categoryName).toBe("Development");
    expect(result.current.billable).toBe(false);
    expect(result.current.customValues).toEqual({ "f-1": "opt-1" });
  });

  it("handleAdd com o quê explícito grava ele, não o estado do render anterior", async () => {
    const { result } = renderWithCatalog();
    act(() => result.current.setName("Outra coisa"));

    let added = false;
    await act(async () => {
      result.current.applyInterpretation(what);
      added = await result.current.handleAdd(undefined, what);
    });

    expect(added).toBe(true);
    expect(taskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Alinhamento sprint",
        projectId: "p-1",
        categoryId: "c-1",
        billable: false,
        customValues: { "f-1": "opt-1" },
      })
    );
    // Encadeia como o formulário: o nome limpa, projeto e categoria ficam.
    expect(result.current.name).toBe("");
    expect(result.current.projectName).toBe("Tech interno");
  });

  it("o início de tarefa do omnibox não vaza startTime nem plannedTaskId", async () => {
    const { result } = renderWithCatalog();
    const fromOmnibox = { ...what, startTime: "2020-01-01T00:00:00Z", plannedTaskId: null };

    await act(() => result.current.handleAdd(undefined, fromOmnibox));

    const saved = vi.mocked(taskRepo.save).mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(saved.startTime).not.toBe("2020-01-01T00:00:00Z");
    expect(saved).not.toHaveProperty("plannedTaskId");
  });

  it("applyInterpretation desfaz o vínculo com a planejada do pré-preenchimento", async () => {
    const { result } = renderWithCatalog();
    act(() => result.current.prefill(planned()));

    await act(async () => {
      result.current.applyInterpretation(what);
      await result.current.handleAdd(undefined, what);
    });

    expect(taskRepo.save).toHaveBeenCalledTimes(1);
    expect(plannedTaskRepo.complete).not.toHaveBeenCalled();
  });

  it("handleAdd devolve false quando o domínio recusa", async () => {
    const { result } = renderWithCatalog();

    let added = true;
    await act(async () => {
      added = await result.current.handleAdd(result.current.startTime, what);
    });

    expect(added).toBe(false);
    expect(taskRepo.save).not.toHaveBeenCalled();
  });
});
