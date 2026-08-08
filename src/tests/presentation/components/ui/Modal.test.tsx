import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Modal } from "@presentation/components/ui/Modal";

describe("Modal", () => {
  it("o título nomeia o diálogo — sem isso o leitor de tela anuncia só 'diálogo'", () => {
    render(
      <Modal title="Editar tarefa" onClose={vi.fn()}>
        corpo
      </Modal>
    );
    expect(screen.getByRole("dialog", { name: "Editar tarefa" })).toBeTruthy();
  });

  it("o rodapé só existe quando há ação — sem ele, nenhuma faixa vazia", () => {
    const { rerender } = render(
      <Modal title="Mover tarefas" onClose={vi.fn()}>
        corpo
      </Modal>
    );
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();

    rerender(
      <Modal title="Mover tarefas" onClose={vi.fn()} footer={<button>Cancelar</button>}>
        corpo
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("o X fecha e tem nome acessível — é o único controle do cabeçalho", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Conectar ao Monday" onClose={onClose}>
        corpo
      </Modal>
    );
    screen.getByRole("button", { name: "Fechar" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ESC fecha, como em todo modal (§8.2)", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Importar" onClose={onClose}>
        corpo
      </Modal>
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ESC já consumido por um dropdown aberto não fecha o modal junto", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Importar" onClose={onClose}>
        corpo
      </Modal>
    );
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    event.preventDefault();
    window.dispatchEvent(event);
    expect(onClose).not.toHaveBeenCalled();
  });
});
