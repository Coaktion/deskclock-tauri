import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { PlannedTaskItem } from "@presentation/components/PlannedTaskItem";
import { PLAY_BLOCKED_TITLE } from "@presentation/components/playAction";
import { showToast } from "@shared/utils/toast";

vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(() => Promise.resolve()) }));
// O modal de edição monta contextos e repositórios; aqui interessa só se abriu.
vi.mock("@presentation/modals/EditPlannedTaskModal", () => ({
  EditPlannedTaskModal: () => <div data-testid="modal-edicao" />,
}));

const DAY = "2026-04-08";

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Revisão de PRs",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: DAY,
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

type Props = ComponentProps<typeof PlannedTaskItem>;

function renderItem(overrides: Partial<Props> = {}) {
  const props: Props = {
    task: makeTask(),
    dateISO: DAY,
    projects: [],
    categories: [],
    customFields: [],
    onPlay: vi.fn(),
    onUpdate: vi.fn(() => Promise.resolve()),
    onComplete: vi.fn(),
    onUncomplete: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
  const utils = render(<PlannedTaskItem {...props} />);
  return { ...utils, props };
}

function row(): HTMLElement {
  return screen.getByText(/Revisão de PRs|Outra/).closest(".group") as HTMLElement;
}

const modal = () => screen.queryByTestId("modal-edicao");

const writeText = vi.fn(() => Promise.resolve());

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PlannedTaskItem — gestos", () => {
  it("clique na linha abre a edição", () => {
    renderItem();
    fireEvent.click(row());
    expect(modal()).toBeTruthy();
  });

  it("no modo de seleção, o clique marca e não abre a edição", () => {
    const { props } = renderItem({ selectMode: true });
    fireEvent.click(row());
    expect(props.onToggleSelect).toHaveBeenCalledWith("t1");
    expect(modal()).toBeNull();
  });

  it("clique no círculo conclui sem abrir a edição", () => {
    const { props } = renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(props.onComplete).toHaveBeenCalledWith("t1", DAY);
    expect(modal()).toBeNull();
  });

  it("na concluída, o círculo reabre", () => {
    const { props } = renderItem({ task: makeTask({ completedDates: [DAY] }) });
    fireEvent.click(screen.getByRole("button", { name: "Marcar como pendente" }));
    expect(props.onUncomplete).toHaveBeenCalledWith("t1", DAY);
  });

  it("clique no Play inicia sem abrir a edição", () => {
    const { props } = renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(props.onPlay).toHaveBeenCalledTimes(1);
    expect(modal()).toBeNull();
  });

  it("clique no ⋯ abre o menu sem abrir a edição", () => {
    renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(modal()).toBeNull();
  });

  it("clique no chip alterna o faturamento sem abrir a edição", () => {
    const { props } = renderItem();
    fireEvent.click(screen.getByText("Billable"));
    expect(props.onUpdate).toHaveBeenCalledWith("t1", { billable: false });
    expect(modal()).toBeNull();
  });

  it("o ⚡ saiu da linha e as ações viraram submenu do ⋯ (H1)", () => {
    renderItem({
      task: makeTask({
        actions: [
          { type: "open_url", value: "https://meet.google.com/abc" },
          { type: "open_file", value: "/home/eduardo/ata.md" },
        ],
      }),
    });
    expect(screen.queryByRole("button", { name: /^Abrir/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: "Ações" }));
    expect(screen.getByRole("menuitem", { name: "Meet" })).toBeTruthy();
    expect(modal()).toBeNull();
  });

  it("clique direito abre o menu no ponto e segura o menu do sistema", () => {
    renderItem();
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

  it("o ⋯ se diz pressionado só quando foi ele que abriu o menu", () => {
    renderItem();
    const mais = () => screen.getByRole("button", { name: "Mais ações" });
    expect(mais().getAttribute("aria-pressed")).toBe("false");

    fireEvent.contextMenu(row(), { clientX: 10, clientY: 10 });
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(mais().getAttribute("aria-pressed")).toBe("false");
  });

  it("entrar no modo de seleção fecha o menu, e sair não o reabre", () => {
    const { props, rerender } = renderItem();
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    rerender(<PlannedTaskItem {...props} selectMode />);
    expect(screen.queryByRole("menu")).toBeNull();
    rerender(<PlannedTaskItem {...props} selectMode={false} />);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("no modo de seleção, o clique direito não abre menu e o ⋯ some", () => {
    renderItem({ selectMode: true });
    fireEvent.contextMenu(row());
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
  });
});

describe("PlannedTaskItem — menu", () => {
  function openMenu() {
    fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));
  }

  it("tem Editar, Duplicar, Copiar link e Excluir, e não mais Compartilhar", () => {
    renderItem();
    openMenu();
    const itens = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(itens).toEqual(["EditarE", "DuplicarD", "Copiar linkL", "ExcluirDel"]);
    expect(screen.queryByText("Compartilhar")).toBeNull();
  });

  it("Editar abre o modal", () => {
    renderItem();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(modal()).toBeTruthy();
  });

  it("Duplicar e Excluir chamam as ações da tela", () => {
    const { props } = renderItem();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Duplicar/ }));
    expect(props.onDuplicate).toHaveBeenCalledWith("t1");

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onDelete).toHaveBeenCalledWith("t1");
    expect(modal()).toBeNull();
  });

  it("Copiar link escreve o deeplink e avisa por toast", async () => {
    renderItem();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Copiar link/ }));
    await vi.waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^deskclock:\/\/task\/share/));
    expect(showToast).toHaveBeenCalledWith("success", "Link copiado para a área de transferência.");
  });
});

describe("PlannedTaskItem — teclado", () => {
  function press(target: HTMLElement, key: string) {
    const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    fireEvent(target, evento);
    return evento;
  }

  it("Espaço conclui e é consumido", () => {
    const { props } = renderItem();
    const evento = press(row(), " ");
    expect(props.onComplete).toHaveBeenCalledWith("t1", DAY);
    expect(evento.defaultPrevented).toBe(true);
  });

  it("Enter inicia", () => {
    const { props } = renderItem();
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(props.onPlay).toHaveBeenCalledTimes(1);
  });

  it("Enter não inicia com o Play bloqueado, nem na concluída — e continua consumido", () => {
    const bloqueada = renderItem({ playBlock: "other" });
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(bloqueada.props.onPlay).not.toHaveBeenCalled();
    cleanup();

    const concluida = renderItem({ task: makeTask({ completedDates: [DAY] }) });
    press(row(), "Enter");
    expect(concluida.props.onPlay).not.toHaveBeenCalled();
  });

  it("E abre a edição, D duplica, L copia e Delete exclui", async () => {
    const { props } = renderItem();
    press(row(), "E");
    expect(modal()).toBeTruthy();
    press(row(), "d");
    expect(props.onDuplicate).toHaveBeenCalledWith("t1");
    press(row(), "l");
    await vi.waitFor(() => expect(writeText).toHaveBeenCalled());
    press(row(), "Delete");
    expect(props.onDelete).toHaveBeenCalledWith("t1");
  });

  it("tecla com modificador ou fora do mapa passa adiante", () => {
    const { props } = renderItem();
    const ctrlZ = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    fireEvent(row(), ctrlZ);
    expect(ctrlZ.defaultPrevented).toBe(false);
    expect(press(row(), "x").defaultPrevented).toBe(false);
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("tecla vinda de um botão dentro da linha é ignorada pela linha", () => {
    const { props } = renderItem();
    const evento = press(screen.getByRole("button", { name: "Iniciar" }), " ");
    expect(props.onComplete).not.toHaveBeenCalled();
    expect(evento.defaultPrevented).toBe(false);
  });

  it("as setas movem o foco entre as linhas vizinhas, e param nas pontas", () => {
    const base = {
      dateISO: DAY,
      projects: [],
      categories: [],
      customFields: [],
      onPlay: vi.fn(),
      onUpdate: vi.fn(() => Promise.resolve()),
      onComplete: vi.fn(),
      onUncomplete: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
    };
    render(
      <div>
        <PlannedTaskItem {...base} task={makeTask({ id: "a", name: "Primeira" })} />
        <PlannedTaskItem {...base} task={makeTask({ id: "b", name: "Segunda" })} />
      </div>
    );
    const primeira = screen.getByText("Primeira").closest(".group") as HTMLElement;
    const segunda = screen.getByText("Segunda").closest(".group") as HTMLElement;

    primeira.focus();
    expect(press(primeira, "ArrowDown").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(segunda);
    press(segunda, "ArrowDown");
    expect(document.activeElement).toBe(segunda);
    press(segunda, "ArrowUp");
    expect(document.activeElement).toBe(primeira);
    press(primeira, "ArrowUp");
    expect(document.activeElement).toBe(primeira);
  });

  it("no modo de seleção a linha não é focável nem responde a atalho", () => {
    const { props } = renderItem({ selectMode: true });
    expect(row().hasAttribute("tabindex")).toBe(false);
    press(row(), "Delete");
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});

describe("PlannedTaskItem — coluna do Play", () => {
  const playSlot = () => document.querySelector("[data-play-slot]");

  it("bloqueado, o Play fica visível, desabilitado e diz o motivo", () => {
    renderItem({ playBlock: "other" });
    const play = screen.getByRole("button", { name: PLAY_BLOCKED_TITLE }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    expect(play.getAttribute("title")).toBe(PLAY_BLOCKED_TITLE);
  });

  it("na concluída a coluna fica, vazia", () => {
    renderItem({ task: makeTask({ completedDates: [DAY] }) });
    expect(playSlot()).toBeTruthy();
    expect(playSlot()!.children.length).toBe(0);
  });

  it("no modo de seleção a coluna fica, vazia", () => {
    renderItem({ selectMode: true });
    expect(playSlot()).toBeTruthy();
    expect(playSlot()!.children.length).toBe(0);
  });
});
