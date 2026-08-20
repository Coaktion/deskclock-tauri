import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * O hook define o que o Enter faz em **todo** formulário do app, então o teste
 * exercita a árvore de verdade — container com filhos — e não a função isolada:
 * o que se quer afirmar é sobre borbulhamento e `defaultPrevented`, que só
 * existem com DOM no meio.
 */
function Form({
  onSubmit,
  disabled = false,
  children,
}: {
  onSubmit: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const handleKeyDown = useSubmitOnEnter(onSubmit, { disabled });
  return (
    <div onKeyDown={handleKeyDown} data-testid="form">
      {children}
    </div>
  );
}

/** Campo que consome o Enter, como o dropdown aberto do Autocomplete. */
function ConsumingField() {
  return (
    <input
      aria-label="consome"
      onKeyDown={(e) => {
        if (e.key === "Enter") e.preventDefault();
      }}
    />
  );
}

function pressEnter(label: string, init: Partial<KeyboardEventInit> = {}) {
  fireEvent.keyDown(screen.getByLabelText(label), { key: "Enter", ...init });
}

describe("useSubmitOnEnter", () => {
  it("submete no Enter vindo de um campo qualquer do formulário", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <input aria-label="nome" />
      </Form>
    );

    pressEnter("nome");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submete de um campo aninhado em qualquer profundidade", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <div>
          <div>
            <input aria-label="fundo" />
          </div>
        </div>
      </Form>
    );

    pressEnter("fundo");

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("ignora tecla que não é Enter", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <input aria-label="nome" />
      </Form>
    );

    fireEvent.keyDown(screen.getByLabelText("nome"), { key: "a" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não submete quando o campo já consumiu o Enter — é assim que a lista aberta seleciona sem submeter junto", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <ConsumingField />
      </Form>
    );

    pressEnter("consome");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não submete durante composição de IME", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <input aria-label="nome" />
      </Form>
    );

    pressEnter("nome", { isComposing: true });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não submete a partir de um botão — ali o Enter é clique", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <button type="button" aria-label="alternar" />
      </Form>
    );

    pressEnter("alternar");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não submete a partir de um link", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <a href="#ajuda" aria-label="ajuda" />
      </Form>
    );

    pressEnter("ajuda");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("em textarea o Enter quebra linha", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <textarea aria-label="observações" />
      </Form>
    );

    pressEnter("observações");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("em textarea Ctrl+Enter e Cmd+Enter submetem", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <textarea aria-label="observações" />
      </Form>
    );

    pressEnter("observações", { ctrlKey: true });
    pressEnter("observações", { metaKey: true });

    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("não submete de dentro de um sub-formulário marcado com data-no-submit", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit}>
        <div data-no-submit>
          <input aria-label="nova ação" />
        </div>
      </Form>
    );

    pressEnter("nova ação");

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("não submete enquanto desabilitado", () => {
    const onSubmit = vi.fn();
    render(
      <Form onSubmit={onSubmit} disabled>
        <input aria-label="nome" />
      </Form>
    );

    pressEnter("nome");

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
