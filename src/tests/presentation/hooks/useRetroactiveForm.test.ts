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
