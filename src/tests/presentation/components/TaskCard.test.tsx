import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import { PLAY_BLOCKED_TITLE, PLAY_SELF_TITLE } from "@presentation/components/playAction";
import { TaskCard } from "@presentation/components/TaskCard";

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

type Props = ComponentProps<typeof TaskCard>;

function renderCard(overrides: Partial<Props> = {}) {
  const props: Props = {
    task: makeTask(),
    projects: [],
    categories: [],
    onPlay: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleBillable: vi.fn(),
    ...overrides,
  };
  render(<TaskCard {...props} />);
  return props;
}

const row = () => screen.getByText("Daily do time").closest(".group") as HTMLElement;
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));

function press(target: HTMLElement, key: string) {
  const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(target, evento);
  return evento;
}

afterEach(cleanup);

describe("TaskCard — gestos", () => {
  it("clique na linha edita", () => {
    const props = renderCard();
    fireEvent.click(row());
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
  });

  it("o Play fica na coluna fixa, com o rótulo das Entradas, e inicia sem editar", () => {
    const props = renderCard();
    const play = screen.getByRole("button", { name: "Iniciar com estes dados" });
    expect(document.querySelector("[data-play-slot]")?.contains(play)).toBe(true);
    fireEvent.click(play);
    expect(props.onPlay).toHaveBeenCalledWith(props.task);
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("bloqueado, o Play fica visível, desabilitado e diz o motivo", () => {
    renderCard({ playBlock: "other" });
    const play = screen.getByRole("button", { name: PLAY_BLOCKED_TITLE }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    cleanup();
    renderCard({ playBlock: "self" });
    expect(
      (screen.getByRole("button", { name: PLAY_SELF_TITLE }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("não sobra botão de Editar nem de Excluir na linha: os dois estão no menu", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
  });

  it("clique no ⋯ e no chip não editam", () => {
    const props = renderCard();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Billable/i }));
    expect(props.onEdit).not.toHaveBeenCalled();
    expect(props.onToggleBillable).toHaveBeenCalledWith(props.task);
  });

  it("clique direito abre o menu no ponto e segura o menu do sistema", () => {
    renderCard();
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(screen.getByRole("menu")).toBeTruthy();
  });
});

describe("TaskCard — menu", () => {
  it("tem só Editar e Excluir", () => {
    renderCard();
    openMenu();
    const itens = screen.getAllByRole("menuitem").map((i) => i.textContent);
    expect(itens).toEqual(["EditarE", "ExcluirDel"]);
  });

  it("Editar e Excluir chamam as ações da tela", () => {
    const props = renderCard();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });
});

describe("TaskCard — teclado", () => {
  it("a linha é focável; Enter inicia, E edita e Delete exclui, consumidos", () => {
    const props = renderCard();
    expect(row().getAttribute("tabindex")).toBe("0");
    expect(press(row(), "Enter").defaultPrevented).toBe(true);
    expect(props.onPlay).toHaveBeenCalledWith(props.task);
    press(row(), "E");
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
    press(row(), "Delete");
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });

  it("Enter não inicia com o Play bloqueado", () => {
    const props = renderCard({ playBlock: "self" });
    press(row(), "Enter");
    expect(props.onPlay).not.toHaveBeenCalled();
  });

  it("Espaço, D e L não fazem nada: lançamento não conclui, não duplica nem copia link", () => {
    renderCard();
    for (const key of [" ", "d", "l"]) {
      expect(press(row(), key).defaultPrevented).toBe(false);
    }
  });
});
