import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { PLAY_BLOCKED_TITLE } from "@presentation/components/playAction";
import { PopupOverlayContent } from "@presentation/overlays/PopupOverlayContent";
import { PopupPlannedRow } from "@presentation/overlays/PopupPlannedRow";
import { showToast } from "@shared/utils/toast";
import { todayISO } from "@shared/utils/time";

vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(() => Promise.resolve()) }));

// O conteúdo do popup inteiro só entra no último bloco, para afirmar a fiação da
// linha nos hooks; o resto dele (header, abas, rodapé) fica de fora.
const planned = vi.hoisted(() => ({
  tasks: [] as PlannedTask[],
  complete: vi.fn(() => Promise.resolve()),
  duplicate: vi.fn(() => Promise.resolve()),
  removeWithUndo: vi.fn(() => Promise.resolve()),
}));
vi.mock("@presentation/hooks/usePlannedTasks", () => ({
  usePlannedTasksForDate: () => ({
    tasks: planned.tasks,
    reload: vi.fn(),
    syncAfterMutation: vi.fn(),
    complete: planned.complete,
    update: vi.fn(),
    duplicate: planned.duplicate,
  }),
}));
vi.mock("@presentation/hooks/usePlannedTaskUndo", () => ({
  usePlannedTaskUndo: () => ({ removeWithUndo: planned.removeWithUndo }),
}));
vi.mock("@presentation/hooks/useTrackedMeetingPlannedIds", () => ({
  useTrackedMeetingPlannedIds: () => ({ plannedIds: new Set<string>() }),
}));
vi.mock("@presentation/hooks/useCompletedTasksForDate", () => ({
  useCompletedTasksForDate: () => ({ groups: [], totalSeconds: 0, updateGroup: vi.fn() }),
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
vi.mock("@presentation/overlays/PlannedTaskEditSheet", () => ({
  PlannedTaskEditSheet: () => <div data-testid="painel-edicao" />,
}));

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Revisão de PRs",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

type Props = ComponentProps<typeof PopupPlannedRow>;

function renderRow(overrides: Partial<Props> = {}) {
  const props: Props = {
    task: makeTask(),
    projects: [],
    categories: [],
    customFields: [],
    tracked: false,
    playBlock: "none",
    onEdit: vi.fn(),
    onComplete: vi.fn(),
    onPlay: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  const utils = render(<PopupPlannedRow {...props} />);
  return { ...utils, props };
}

function row(name = "Revisão de PRs"): HTMLElement {
  return screen.getByText(name).closest(".group") as HTMLElement;
}

function press(target: HTMLElement, key: string) {
  const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(target, evento);
  return evento;
}

const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  planned.tasks = [];
});

describe("PopupPlannedRow — gestos", () => {
  it("clique na linha edita", () => {
    const { props } = renderRow();
    fireEvent.click(row());
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
  });

  it("clique no círculo conclui sem editar", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onComplete).toHaveBeenCalledWith(props.task);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("clique no Play inicia sem editar", () => {
    const { props } = renderRow();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(props.onPlay).toHaveBeenCalledWith(props.task);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("bloqueado, o Play fica visível, desabilitado e diz o motivo", () => {
    renderRow({ playBlock: "other" });
    const play = screen.getByRole("button", { name: PLAY_BLOCKED_TITLE }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(document.querySelector("[data-play-slot]")?.contains(play)).toBe(true);
  });

  it("clique no ⋯ abre o menu sem editar", () => {
    const { props } = renderRow();
    openMenu();
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("o ⚡ saiu da linha e as ações viraram submenu do ⋯ (H1)", () => {
    const { props } = renderRow({
      task: makeTask({
        actions: [
          { type: "open_url", value: "https://meet.google.com/abc" },
          { type: "open_file", value: "/home/eduardo/ata.md" },
        ],
      }),
    });
    expect(screen.queryByRole("button", { name: /^Abrir/ })).toBeNull();
    openMenu();
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Ações" }));
    expect(screen.getByRole("menuitem", { name: "ata.md" })).toBeTruthy();
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("clique direito abre o menu no ponto e segura o menu do sistema", () => {
    renderRow();
    const evento = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 40,
      clientY: 60,
    });
    fireEvent(row(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("PopupPlannedRow — menu", () => {
  it("tem Editar, Duplicar, Copiar link e Excluir", () => {
    renderRow();
    openMenu();
    const itens = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(itens).toEqual(["EditarE", "DuplicarD", "Copiar linkL", "ExcluirDel"]);
  });

  it("Editar, Duplicar e Excluir chamam as ações da tela", () => {
    const { props } = renderRow();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(props.onEdit).toHaveBeenCalledWith(props.task);

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Duplicar/ }));
    expect(props.onDuplicate).toHaveBeenCalledWith(props.task);

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });

  it("Copiar link escreve o deeplink e avisa por toast", async () => {
    renderRow();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Copiar link/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^deskclock:\/\/task\/share/));
  });

  it("o ESC do menu é consumido e não chega ao document, onde o popup se esconderia", () => {
    renderRow();
    openMenu();
    const noDocument = vi.fn();
    document.addEventListener("keydown", noDocument);
    const evento = press(screen.getByRole("menu"), "Escape");
    document.removeEventListener("keydown", noDocument);
    expect(evento.defaultPrevented).toBe(true);
    expect(noDocument).not.toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("PopupPlannedRow — teclado", () => {
  it("a linha é focável; Espaço conclui e Enter inicia, consumidos", () => {
    const { props } = renderRow();
    expect(row().getAttribute("tabindex")).toBe("0");
    expect(press(row(), " ").defaultPrevented).toBe(true);
    expect(props.onComplete).toHaveBeenCalledWith(props.task);
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(props.onPlay).toHaveBeenCalledWith(props.task);
  });

  it("Enter não inicia com o Play bloqueado", () => {
    const { props } = renderRow({ playBlock: "self" });
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(props.onPlay).not.toHaveBeenCalled();
  });

  it("E edita, D duplica, L copia e Delete exclui", async () => {
    const { props } = renderRow();
    press(row(), "e");
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
    press(row(), "D");
    expect(props.onDuplicate).toHaveBeenCalledWith(props.task);
    press(row(), "l");
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    press(row(), "Delete");
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });

  it("tecla vinda de um botão dentro da linha é ignorada pela linha", () => {
    const { props } = renderRow();
    const evento = press(screen.getByRole("button", { name: "Iniciar" }), " ");
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });
});

describe("PopupOverlayContent — a linha planejada nos hooks", () => {
  function renderPopup() {
    planned.tasks = [makeTask()];
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
  }

  it("excluir passa pelo desfazer, com o id da linha", () => {
    renderPopup();
    press(row(), "Delete");
    expect(planned.removeWithUndo).toHaveBeenCalledWith(["t1"]);
  });

  it("duplicar e concluir vão ao hook das planejadas do dia", () => {
    renderPopup();
    press(row(), "d");
    expect(planned.duplicate).toHaveBeenCalledWith("t1");
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(planned.complete).toHaveBeenCalledWith("t1", todayISO());
  });

  it("clique na linha abre o painel de edição do popup", () => {
    renderPopup();
    fireEvent.click(row());
    expect(screen.getByTestId("painel-edicao")).toBeTruthy();
  });
});
