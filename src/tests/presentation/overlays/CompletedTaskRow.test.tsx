import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { PLAY_BLOCKED_TITLE, PLAY_SELF_TITLE } from "@presentation/components/playAction";
import { CompletedTaskRow } from "@presentation/overlays/CompletedTaskRow";
import { PopupOverlayContent } from "@presentation/overlays/PopupOverlayContent";

// O popup inteiro só entra no último bloco, para afirmar a fiação da linha
// executada nos hooks; o resto dele (header, planejadas, rodapé) fica de fora.
const popup = vi.hoisted(() => ({
  groups: [] as { key: string; tasks: { id: string }[]; totalSeconds: number }[],
  removeWithUndo: vi.fn(() => Promise.resolve()),
  reloadCompleted: vi.fn(() => Promise.resolve()),
}));
vi.mock("@presentation/hooks/usePlannedTasks", () => ({
  usePlannedTasksForDate: () => ({
    tasks: [],
    reload: vi.fn(),
    syncAfterMutation: vi.fn(),
    complete: vi.fn(),
    update: vi.fn(),
    duplicate: vi.fn(),
  }),
}));
vi.mock("@presentation/hooks/usePlannedTaskUndo", () => ({
  usePlannedTaskUndo: () => ({ removeWithUndo: vi.fn() }),
}));
vi.mock("@presentation/hooks/useTaskUndo", () => ({
  useTaskUndo: () => ({ removeWithUndo: popup.removeWithUndo }),
}));
vi.mock("@presentation/hooks/useTrackedMeetingPlannedIds", () => ({
  useTrackedMeetingPlannedIds: () => ({ plannedIds: new Set<string>() }),
}));
vi.mock("@presentation/hooks/useCompletedTasksForDate", () => ({
  useCompletedTasksForDate: () => ({
    groups: popup.groups,
    totalSeconds: 0,
    reload: popup.reloadCompleted,
    updateGroup: vi.fn(),
  }),
}));
vi.mock("@presentation/hooks/useProjects", () => ({ useProjects: () => ({ projects: [] }) }));
vi.mock("@presentation/hooks/useCategories", () => ({
  useCategories: () => ({ categories: [] }),
}));
vi.mock("@presentation/hooks/useCustomFields", () => ({
  useCustomFields: () => ({ fields: [], activeFields: [] }),
}));
vi.mock("@presentation/overlays/OverlayWorkspaceChip", () => ({
  OverlayWorkspaceChip: () => null,
}));
vi.mock("@presentation/overlays/CompletedTaskEditSheet", () => ({
  CompletedTaskEditSheet: () => <div data-testid="painel-edicao" />,
}));

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
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
    ...overrides,
  };
}

function makeGroup(tasks: Task[] = [makeTask()]): TaskGroup {
  return {
    key: "grupo-1",
    tasks,
    totalSeconds: tasks.reduce((acc, t) => acc + (t.durationSeconds ?? 0), 0),
  };
}

type Props = ComponentProps<typeof CompletedTaskRow>;

function renderRow(overrides: Partial<Props> = {}) {
  const props: Props = {
    group: makeGroup(),
    projects: [],
    categories: [],
    actions: [],
    playBlock: "none",
    onRepeat: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<CompletedTaskRow {...props} />);
  return props;
}

const row = () => screen.getByText("Daily do time").closest(".group") as HTMLElement;
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));

function press(target: HTMLElement, key: string) {
  const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(target, evento);
  return evento;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  popup.groups = [];
});

describe("CompletedTaskRow — desenho", () => {
  it("não tem círculo de concluir: lançamento não se conclui", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Concluir" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reabrir" })).toBeNull();
  });

  it("o par Editar/Repetir saiu da linha: sobram o ▶ e o ⋯", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Repetir tarefa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mais ações" })).toBeTruthy();
  });

  it("o ⚡ saiu da linha, mesmo com a origem tendo ações (H1)", () => {
    renderRow({ actions: [{ type: "open_url", value: "https://meet.google.com/abc" }] });
    expect(screen.queryByRole("button", { name: /^Abrir/ })).toBeNull();
  });
});

describe("CompletedTaskRow — gestos", () => {
  it("clique na linha edita o grupo", () => {
    const props = renderRow();
    fireEvent.click(row());
    expect(props.onEdit).toHaveBeenCalledWith(props.group);
  });

  it("o ▶ fica na coluna fixa, repete e não edita", () => {
    const props = renderRow();
    const play = screen.getByRole("button", { name: "Repetir com estes dados" });
    expect(document.querySelector("[data-play-slot]")?.contains(play)).toBe(true);
    fireEvent.click(play);
    expect(props.onRepeat).toHaveBeenCalledWith(props.group);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("bloqueado, o ▶ fica visível, desabilitado e diz o motivo", () => {
    renderRow({ playBlock: "other" });
    expect(
      (screen.getByRole("button", { name: PLAY_BLOCKED_TITLE }) as HTMLButtonElement).disabled
    ).toBe(true);
    cleanup();
    renderRow({ playBlock: "self" });
    expect(
      (screen.getByRole("button", { name: PLAY_SELF_TITLE }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("clique no ⋯ abre o menu sem editar", () => {
    const props = renderRow();
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("clique direito abre o menu no ponto e segura o menu do sistema", () => {
    renderRow();
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("CompletedTaskRow — menu", () => {
  it("tem Editar e Excluir, com o Excluir por último", () => {
    renderRow();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "EditarE",
      "ExcluirDel",
    ]);
  });

  it("com ações, a seção delas abre o menu e o Excluir continua no fim", () => {
    renderRow({ actions: [{ type: "open_file", value: "/home/eduardo/ata.md" }] });
    openMenu();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "Abrir ata.md",
      "EditarE",
      "ExcluirDel",
    ]);
  });

  it("com duas ações, elas viram o submenu “Ações”, ainda no topo", () => {
    renderRow({
      actions: [
        { type: "open_url", value: "https://meet.google.com/abc" },
        { type: "open_file", value: "/home/eduardo/ata.md" },
      ],
    });
    openMenu();
    const itens = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(itens[0]).toBe("Ações");
    expect(itens[itens.length - 1]).toBe("ExcluirDel");
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Ações" }));
    expect(screen.getByRole("menuitem", { name: "ata.md" })).toBeTruthy();
  });

  it("Editar e Excluir chamam as ações do popup", () => {
    const props = renderRow();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(props.onEdit).toHaveBeenCalledWith(props.group);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onDelete).toHaveBeenCalledWith(props.group);
  });
});

describe("CompletedTaskRow — teclado", () => {
  it("a linha é focável; Enter repete, E edita e Delete exclui, consumidos", () => {
    const props = renderRow();
    expect(row().getAttribute("tabindex")).toBe("0");
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(props.onRepeat).toHaveBeenCalledWith(props.group);
    expect(press(row(), "E").defaultPrevented).toBe(true);
    expect(props.onEdit).toHaveBeenCalledWith(props.group);
    expect(press(row(), "Delete").defaultPrevented).toBe(true);
    expect(props.onDelete).toHaveBeenCalledWith(props.group);
  });

  it("Enter não repete com o ▶ bloqueado", () => {
    const props = renderRow({ playBlock: "self" });
    press(row(), "Enter");
    expect(props.onRepeat).not.toHaveBeenCalled();
  });

  it("Espaço, D e L não fazem nada: lançamento não conclui, não duplica nem copia link", () => {
    renderRow();
    for (const key of [" ", "d", "l"]) {
      expect(press(row(), key).defaultPrevented).toBe(false);
    }
  });
});

describe("PopupOverlayContent — a linha executada nos hooks", () => {
  function renderPopup() {
    popup.groups = [makeGroup([makeTask(), makeTask({ id: "t2" })])];
    render(
      <PopupOverlayContent
        runningTask={null}
        activePlannedTaskActions={[]}
        onNavigatePlanning={vi.fn()}
        onResize={vi.fn()}
        onModalOpenChange={vi.fn()}
        onStartTask={vi.fn(() => Promise.resolve())}
        onPlay={vi.fn(() => Promise.resolve())}
        onPause={vi.fn(() => Promise.resolve())}
        onResume={vi.fn(() => Promise.resolve())}
        onStop={vi.fn(() => Promise.resolve())}
        onCancel={vi.fn(() => Promise.resolve())}
        onUpdateTask={vi.fn(() => Promise.resolve())}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Executadas/ }));
  }

  it("excluir passa pelo desfazer, com os ids de todas as irmãs do grupo", () => {
    renderPopup();
    press(row(), "Delete");
    expect(popup.removeWithUndo).toHaveBeenCalledWith(["t1", "t2"]);
  });

  it("clique na linha abre o painel de edição do popup", () => {
    renderPopup();
    fireEvent.click(row());
    expect(screen.getByTestId("painel-edicao")).toBeTruthy();
  });
});
