import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { TaskGroupCard } from "@presentation/components/TaskGroupCard";
import { TodayEntriesSection } from "@presentation/components/TodayEntriesSection";

const undo = vi.hoisted(() => ({ removeWithUndo: vi.fn(() => Promise.resolve()) }));
vi.mock("@presentation/hooks/useTaskUndo", () => ({
  useTaskUndo: () => ({ removeWithUndo: undo.removeWithUndo }),
}));
vi.mock("@presentation/hooks/useRunningTask", () => ({
  useRunningTask: () => ({ runningTask: null, startTask: vi.fn() }),
}));
vi.mock("@presentation/contexts/RepositoriesContext", () => ({
  useRepositories: () => ({
    taskRepo: {},
    taskLogRepo: { findSentIds: () => Promise.resolve([]) },
  }),
}));
vi.mock("@presentation/contexts/WorkspaceContext", () => ({
  useWorkspaces: () => ({ workspaces: [] }),
}));

function makeTask(id: string): Task {
  return {
    id,
    workspaceId: "ws-1",
    name: "Daily do time",
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: "2026-09-19T12:00:00.000Z",
    endTime: "2026-09-19T12:30:00.000Z",
    durationSeconds: 1800,
    status: "completed",
    createdAt: "2026-09-19T12:00:00.000Z",
    updatedAt: "2026-09-19T12:30:00.000Z",
    customValues: {},
  };
}

function makeGroup(ids: string[]): TaskGroup {
  return { key: "k", tasks: ids.map(makeTask), totalSeconds: 1800 * ids.length };
}

type Props = ComponentProps<typeof TaskGroupCard>;

function renderGroup(overrides: Partial<Props> = {}) {
  const props: Props = {
    group: makeGroup(["a", "b"]),
    projects: [],
    categories: [],
    onPlay: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onMerge: vi.fn(),
    onEditGroup: vi.fn(),
    onMoveToWorkspace: vi.fn(),
    onToggleBillable: vi.fn(),
    ...overrides,
  };
  render(<TaskGroupCard {...props} />);
  return props;
}

const header = () => screen.getByText("2 registros").closest(".group") as HTMLElement;
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
const menuItems = () => screen.getAllByRole("menuitem").map((i) => i.textContent);

function press(target: HTMLElement, key: string) {
  const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(target, evento);
  return evento;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TaskGroupCard — cabeçalho", () => {
  it("clique na linha expande, como antes, e não edita", () => {
    const props = renderGroup();
    expect(screen.queryAllByText("Daily do time")).toHaveLength(1);
    fireEvent.click(header());
    expect(screen.queryAllByText("Daily do time")).toHaveLength(3);
    expect(props.onEditGroup).not.toHaveBeenCalled();
  });

  it("não tem ação visível: o ⋯ é o único botão além do chip, e a coluna do Play fica vazia", () => {
    renderGroup();
    const botoes = Array.from(header().querySelectorAll("button")).map((b) => b.title);
    expect(botoes).toEqual([expect.stringMatching(/^Billable/), "Mais ações"]);
    const slot = header().querySelector("[data-play-slot]")!;
    expect(slot.className).toContain("w-7");
    expect(slot.children).toHaveLength(0);
  });

  it("o ⋯ tem Editar grupo, Mover para workspace e Unificar, e cada um chama a tela", () => {
    const props = renderGroup();
    openMenu();
    expect(menuItems()).toEqual(["Editar grupoE", "Mover para workspace", "Unificar"]);

    fireEvent.click(screen.getByRole("menuitem", { name: /Editar grupo/ }));
    expect(props.onEditGroup).toHaveBeenCalledWith(props.group);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Mover/ }));
    expect(props.onMoveToWorkspace).toHaveBeenCalledWith(props.group.tasks);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Unificar/ }));
    expect(props.onMerge).toHaveBeenCalledWith(props.group);
  });

  it("sem outro workspace, o Mover não aparece", () => {
    renderGroup({ onMoveToWorkspace: undefined });
    openMenu();
    expect(menuItems()).toEqual(["Editar grupoE", "Unificar"]);
  });

  it("clique direito abre o mesmo menu no ponto", () => {
    renderGroup();
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(header(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(menuItems()).toHaveLength(3);
  });

  it("focável: E edita o grupo; Enter e Espaço não expandem nem são consumidos", () => {
    const props = renderGroup();
    expect(header().getAttribute("tabindex")).toBe("0");
    press(header(), "e");
    expect(props.onEditGroup).toHaveBeenCalledWith(props.group);
    expect(press(header(), "Enter").defaultPrevented).toBe(false);
    expect(press(header(), " ").defaultPrevented).toBe(false);
    expect(screen.queryAllByText("Daily do time")).toHaveLength(1);
  });

  it("no modo de seleção não há menu, e o clique marca", () => {
    const onToggleSelect = vi.fn();
    const props = renderGroup({ selectable: true, onToggleSelect });
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    fireEvent.click(header());
    expect(onToggleSelect).toHaveBeenCalledWith(props.group);
  });
});

describe("TaskGroupCard — as filhas", () => {
  it("expandidas, cada uma é um lançamento com Play e menu próprios", () => {
    const props = renderGroup();
    fireEvent.click(header());
    expect(screen.getAllByRole("button", { name: "Iniciar com estes dados" })).toHaveLength(2);
    const filha = screen.getAllByText("Daily do time")[1].closest(".group") as HTMLElement;
    fireEvent.click(filha);
    expect(props.onEdit).toHaveBeenCalledWith(props.group.tasks[0]);
  });

  it("as setas andam do cabeçalho para as filhas", () => {
    renderGroup();
    fireEvent.click(header());
    header().focus();
    press(header(), "ArrowDown");
    expect(document.activeElement?.textContent).toContain("Daily do time");
    expect(document.activeElement).not.toBe(header());
  });
});

describe("TodayEntriesSection — excluir lançamento", () => {
  it("passa pelo desfazer, com o id da linha", () => {
    render(
      <TodayEntriesSection
        groups={[makeGroup(["solta"])]}
        projects={[]}
        categories={[]}
        reload={vi.fn()}
        totalSeconds={1800}
      />
    );
    const linha = screen.getByText("Daily do time").closest(".group") as HTMLElement;
    press(linha, "Delete");
    expect(undo.removeWithUndo).toHaveBeenCalledWith(["solta"]);
  });
});
