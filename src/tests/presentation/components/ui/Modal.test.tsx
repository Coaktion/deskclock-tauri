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

  it("o canto esquerdo do rodapé basta para o rodapé existir — ele não é ação do diálogo", () => {
    render(
      <Modal title="Enviar tarefas" onClose={vi.fn()} footerStart={<button>Todas</button>}>
        corpo
      </Modal>
    );
    expect(screen.getByRole("button", { name: "Todas" })).toBeTruthy();
  });

  it("faixa de filtros e faixa de aviso ficam fora do corpo, para não rolarem com a lista", () => {
    const { container } = render(
      <Modal
        title="Enviar tarefas"
        onClose={vi.fn()}
        toolbar={<span>Hoje</span>}
        notice={<span>Já enviada</span>}
        footer={<button>Enviar</button>}
      >
        <span>lista</span>
      </Modal>
    );
    const body = screen.getByText("lista").parentElement!;
    expect(body.contains(screen.getByText("Hoje"))).toBe(false);
    expect(body.contains(screen.getByText("Já enviada"))).toBe(false);
    // cabeçalho · filtros · corpo · aviso · rodapé
    expect(container.querySelector("[role=dialog]")!.children.length).toBe(5);
  });

  it("o canto direito do cabeçalho age sobre o diálogo, e não filtra a lista", () => {
    render(
      <Modal
        title="Apontamentos do Clockify"
        onClose={vi.fn()}
        headerEnd={<button>Recarregar</button>}
        toolbar={<span>Hoje</span>}
      >
        lista
      </Modal>
    );
    const header = screen.getByRole("heading", { name: "Apontamentos do Clockify" }).parentElement!
      .parentElement!;
    expect(header.contains(screen.getByRole("button", { name: "Recarregar" }))).toBe(true);
    expect(header.contains(screen.getByText("Hoje"))).toBe(false);
  });

  it("o X fecha e tem nome acessível — sem texto, é tudo o que o botão anuncia", () => {
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

  it("marca-se como aberto, ou o ESC esconderia a janela em vez do modal", () => {
    const { container } = render(
      <Modal title="Editar tarefa planejada" onClose={vi.fn()}>
        corpo
      </Modal>
    );
    expect(container.querySelector("[data-modal-open]")).toBeTruthy();
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
