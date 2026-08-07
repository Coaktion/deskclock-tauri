import { useCallback } from "react";

/**
 * Elementos em que o Enter já tem dono: ali ele aciona o próprio controle, e
 * submeter por cima disparia duas coisas com uma tecla.
 */
const SELF_HANDLED = new Set(["BUTTON", "A"]);

interface SubmitOnEnterOptions {
  /**
   * Desliga o atalho sem desmontar o hook — formulário ainda carregando, ou sem
   * destino possível. Um `onSubmit` que não faz nada também resolveria, mas
   * deixaria o `preventDefault` acontecendo à toa.
   */
  disabled?: boolean;
}

/**
 * Enter em qualquer campo do formulário dispara o submit.
 *
 * O handler vai no **container** do formulário, não nos campos: `keydown`
 * borbulha, então um só cobre todos os descendentes — inclusive os que ainda
 * nem existem. Era a ausência disso que deixava o Enter funcionando em uns
 * campos e não em outros, com 37 `onKeyDown` avulsos que ninguém mantinha em
 * sincronia.
 *
 * **O campo avisa quando já consumiu a tecla, via `preventDefault`.** É como o
 * dropdown aberto seleciona a opção sem submeter junto (`Autocomplete`,
 * `DatePickerInput`), e é o mesmo idioma que o `useEscapeToClose` usa para o ESC
 * (§8.2) — um sinal só, entendido pelos dois lados, em vez de o container ter
 * que saber quais filhos abrem lista.
 *
 * Não convertemos os containers em `<form>` de propósito: `<button>` sem
 * `type="button"` dentro de um form vira submit, e são ~15 telas cheias de
 * botões de toggle onde essa regressão seria silenciosa.
 */
export function useSubmitOnEnter(
  onSubmit: () => void,
  { disabled = false }: SubmitOnEnterOptions = {}
) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;
      if (e.key !== "Enter") return;
      // IME em composição: o Enter confirma a palavra, não o formulário.
      if (e.nativeEvent.isComposing) return;
      // Já consumido por um dropdown aberto — ver o bloco acima.
      if (e.defaultPrevented) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (SELF_HANDLED.has(target.tagName)) return;
      // Texto longo existe para ter várias linhas: Enter quebra, Ctrl/Cmd+Enter submete.
      if (target.tagName === "TEXTAREA" && !e.ctrlKey && !e.metaKey) return;
      // Sub-formulário dentro do formulário (a linha "adicionar ação" da
      // planejada, os editores por linha dos modais de lista): ali o Enter tem
      // um destino mais próximo que o submit da tela.
      if (target.closest("[data-no-submit]")) return;

      e.preventDefault();
      onSubmit();
    },
    [disabled, onSubmit]
  );
}
