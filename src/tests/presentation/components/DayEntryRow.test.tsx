import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import { DayEntryRow } from "@presentation/components/DayEntryRow";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Ajustes no relatório",
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

type Props = ComponentProps<typeof DayEntryRow>;

function renderRow(overrides: Partial<Props> = {}) {
  const props: Props = {
    task: makeTask(),
    projects: [],
    categories: [],
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onToggleBillable: vi.fn(),
    onToggleSelect: vi.fn(),
    ...overrides,
  };
  render(<DayEntryRow {...props} />);
  return props;
}

const row = () => screen.getByText("Ajustes no relatório").closest(".group") as HTMLElement;
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "Mais ações" }));

function press(target: HTMLElement, key: string) {
  const evento = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  fireEvent(target, evento);
  return evento;
}

afterEach(cleanup);

describe("DayEntryRow — gestos", () => {
  it("clique na linha edita, fora do modo de seleção", () => {
    const props = renderRow();
    fireEvent.click(row());
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
  });

  it("no modo de seleção o clique marca e não edita", () => {
    const props = renderRow({ selectMode: true });
    fireEvent.click(row());
    expect(props.onToggleSelect).toHaveBeenCalledWith("t1");
    expect(props.onEdit).not.toHaveBeenCalled();
  });

  it("a caixa de seleção existe só no modo de seleção, e o clique nela não edita", () => {
    const props = renderRow({ selectMode: true });
    const caixa = screen.getByRole("checkbox", { name: /Selecionar/ });
    fireEvent.click(caixa);
    expect(props.onToggleSelect).toHaveBeenCalledWith("t1");
    expect(props.onEdit).not.toHaveBeenCalled();
    cleanup();
    renderRow();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("não há ▶ nem círculo: lançamento passado não inicia nem se conclui", () => {
    renderRow();
    expect(document.querySelector("[data-play-slot]")).toBeNull();
    expect(screen.queryByRole("button", { name: /Concluir|Reabrir/ })).toBeNull();
  });

  it("clique no ⋯ e no chip não editam", () => {
    const props = renderRow();
    openMenu();
    fireEvent.click(screen.getByRole("button", { name: /Billable/i }));
    expect(props.onEdit).not.toHaveBeenCalled();
    expect(props.onToggleBillable).toHaveBeenCalledWith(props.task);
  });

  it("clique direito abre o menu no ponto e segura o menu do sistema", () => {
    renderRow();
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row(), evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("no modo de seleção não há ⋯ nem clique direito", () => {
    renderRow({ selectMode: true });
    expect(screen.queryByRole("button", { name: "Mais ações" })).toBeNull();
    const evento = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(row(), evento);
    expect(evento.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("DayEntryRow — menu", () => {
  it("tem só Editar e Excluir", () => {
    renderRow();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((i) => i.textContent)).toEqual([
      "EditarE",
      "ExcluirDel",
    ]);
  });

  it("Editar e Excluir chamam as ações da tela — nada se perdeu da fileira antiga", () => {
    const props = renderRow();
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Editar/ }));
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Excluir/ }));
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });

  it("os dois botões do hover saíram da linha: só o ⋯ ficou", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Editar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mais ações" })).toBeTruthy();
  });

  it("as marcas do call site continuam na linha — o ⚡ do Histórico", () => {
    renderRow({ badges: <span data-marca="">⚡</span> });
    expect(row().querySelector("[data-marca]")).toBeTruthy();
  });
});

describe("DayEntryRow — teclado", () => {
  it("a linha é focável; E edita e Delete exclui, consumidos", () => {
    const props = renderRow();
    expect(row().getAttribute("tabindex")).toBe("0");
    expect(press(row(), "E").defaultPrevented).toBe(true);
    expect(props.onEdit).toHaveBeenCalledWith(props.task);
    expect(press(row(), "Delete").defaultPrevented).toBe(true);
    expect(props.onDelete).toHaveBeenCalledWith(props.task);
  });

  it("Enter, Espaço, D e L não fazem nada: não há ▶, conclusão, duplicar nem link", () => {
    const props = renderRow();
    for (const key of ["Enter", " ", "d", "l"]) {
      expect(press(row(), key).defaultPrevented).toBe(false);
    }
    expect(props.onEdit).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
  });

  it("as setas andam entre as linhas irmãs", () => {
    const tasks = [makeTask(), makeTask({ id: "t2", name: "Segunda linha" })];
    render(
      <div>
        {tasks.map((t) => (
          <DayEntryRow
            key={t.id}
            task={t}
            projects={[]}
            categories={[]}
            onEdit={vi.fn()}
            onDelete={vi.fn()}
            onToggleBillable={vi.fn()}
          />
        ))}
      </div>
    );
    press(screen.getByText("Ajustes no relatório").closest(".group") as HTMLElement, "ArrowDown");
    expect(document.activeElement).toBe(
      screen.getByText("Segunda linha").closest(".group") as HTMLElement
    );
  });

  it("no modo de seleção a linha não é focável nem responde a tecla", () => {
    const props = renderRow({ selectMode: true });
    expect(row().getAttribute("tabindex")).toBeNull();
    expect(press(row(), "Delete").defaultPrevented).toBe(false);
    expect(props.onDelete).not.toHaveBeenCalled();
  });
});
