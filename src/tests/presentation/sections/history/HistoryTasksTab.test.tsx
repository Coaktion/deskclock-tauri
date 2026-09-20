import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import { HistoryTasksTab } from "@presentation/sections/history/HistoryTasksTab";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Ajustes no relatório",
    projectId: null,
    categoryId: null,
    billable: false,
    startTime: "2026-09-19T12:00:00.000Z",
    endTime: "2026-09-19T12:30:00.000Z",
    durationSeconds: 1800,
    status: "completed",
    createdAt: "2026-09-19T12:00:00.000Z",
    updatedAt: "2026-09-19T12:30:00.000Z",
    customValues: {},
    ...overrides,
  };
}

type Props = ComponentProps<typeof HistoryTasksTab>;

function renderTab(overrides: Partial<Props> = {}) {
  const task = makeTask();
  const props: Props = {
    groups: [{ dateISO: "2026-09-19", tasks: [task], totalSeconds: 1800 }],
    allTasks: [task],
    projects: [],
    categories: [],
    selectMode: false,
    selectedIds: new Set<string>(),
    canMoveToWorkspace: false,
    emptyMessage: "Nada aqui",
    plannedIndex: new Map(),
    onEnterSelectMode: vi.fn(),
    onExitSelectMode: vi.fn(),
    onToggleSelectTask: vi.fn(),
    onChangeSelection: vi.fn(),
    onMoveSelected: vi.fn(),
    onBulkDelete: vi.fn(),
    onEditTask: vi.fn(),
    onRemoveTask: vi.fn(),
    onToggleBillable: vi.fn(),
    ...overrides,
  };
  render(<HistoryTasksTab {...props} />);
  return props;
}

const row = () => screen.getByText("Ajustes no relatório").closest(".group") as HTMLElement;

afterEach(cleanup);

describe("HistoryTasksTab — a linha no desenho da G5", () => {
  it("clique na linha edita", () => {
    const props = renderTab();
    fireEvent.click(row());
    expect(props.onEditTask).toHaveBeenCalledWith(props.allTasks[0]);
  });

  it("Excluir no ⋯ chega à tela pelo id, que é por onde o desfazer passa", () => {
    const props = renderTab();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onRemoveTask).toHaveBeenCalledWith("t1");
  });

  it("no modo de seleção o clique marca, e o ⋯ some", () => {
    const props = renderTab({ selectMode: true });
    fireEvent.click(row());
    expect(props.onToggleSelectTask).toHaveBeenCalledWith("t1");
    expect(props.onEditTask).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
  });

  it("o Excluir em lote continua sendo um lote só — um toast e um Desfazer", () => {
    const props = renderTab({ selectMode: true, selectedIds: new Set(["t1"]) });
    fireEvent.click(screen.getByRole("button", { name: /^Excluir/ }));
    expect(props.onBulkDelete).toHaveBeenCalledTimes(1);
  });
});
