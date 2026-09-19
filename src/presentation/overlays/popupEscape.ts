export interface PopupEscapeContext {
  key: string;
  /** Alguém por baixo já consumiu a tecla (contrato de teclado nº 3). */
  defaultPrevented: boolean;
  /** O prompt de reunião aguarda resposta e não pode sumir sem ela. */
  meetingPromptActive: boolean;
  /** Um painel de edição do popup está aberto — fechar descartaria a edição. */
  modalOpen: boolean;
  /** Há `[data-modal-open]` no documento: menu ou painel que se diz modal. */
  modalMarkerPresent: boolean;
}

/**
 * Se o ESC esconde o popup. O ESC do menu da linha já é consumido e contido; o
 * `defaultPrevented` e o `[data-modal-open]` são a segunda guarda, para o ESC
 * que chegue ao `document` sem passar por ele — o mesmo sinal que o
 * `useGlobalShortcuts` lê na janela principal.
 */
export function shouldHidePopupOnEscape(ctx: PopupEscapeContext): boolean {
  if (ctx.key !== "Escape") return false;
  return !(
    ctx.defaultPrevented ||
    ctx.meetingPromptActive ||
    ctx.modalOpen ||
    ctx.modalMarkerPresent
  );
}
