import {
  useLayoutEffect,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { ChevronRight } from "lucide-react";

import { placeMenu } from "./menuPlacement";
import { MENU_DIVIDER, type MenuAnchor, type MenuEntry, type MenuItem } from "./menuTypes";

/** Os itens **habilitados** de um painel, na ordem do DOM. */
export function menuItemsIn(panel: HTMLElement | null): HTMLElement[] {
  return Array.from(
    panel?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
  );
}

interface MenuPanelProps {
  anchor: MenuAnchor;
  /** Submenu: o painel nasce **ao lado** da âncora, e não abaixo dela. */
  side?: boolean;
  /** Nome acessível do painel ("Ações da tarefa", ou o rótulo do item pai). */
  label?: string;
  /** Foca o primeiro item assim que o painel aparece. */
  autoFocus?: boolean;
  panelRef: RefObject<HTMLDivElement | null>;
  onKeyDown: (e: KeyboardEvent) => void;
  children: ReactNode;
}

/**
 * A caixa do menu: portal, medida, posição e visibilidade. É a mesma peça no
 * menu e no submenu — os dois abrem sobre listas que rolam, viram na borda e
 * nascem invisíveis até serem medidos —, e o que muda entre eles é só o lado em
 * que abrem e quem escuta o teclado.
 */
export function MenuPanel({
  anchor,
  side = false,
  label,
  autoFocus = false,
  panelRef,
  onKeyDown,
  children,
}: MenuPanelProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      setPosition(null);
      return;
    }
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placement =
      anchor instanceof HTMLElement
        ? side
          ? { side: anchor.getBoundingClientRect() }
          : { rect: anchor.getBoundingClientRect() }
        : { point: anchor };
    setPosition(placeMenu(placement, size, viewport));
  }, [anchor, side, panelRef]);

  /*
   * O foco espera o painel **aparecer**. Ele nasce em `visibility: hidden` até ser
   * medido, e o navegador recusa foco em elemento invisível — sem erro, o
   * `focus()` só não faz nada, e as setas e o Enter ficavam com a linha por baixo.
   * O jsdom não aplica essa regra, por isso o teste afirma a visibilidade no
   * instante do `focus()`. `preventScroll`: o foco não pode rolar a lista, ou o
   * listener de rolagem fecharia o menu no mesmo instante em que ele abriu.
   */
  const visible = position !== null;
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!visible || !autoFocus || !panel) return;
    (menuItemsIn(panel)[0] ?? panel).focus({ preventScroll: true });
  }, [visible, autoFocus, panelRef]);

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      /* O ESC já é contido pelo `Menu`; o atributo é a segunda guarda, para o ESC
         que chegue ao `document` sem passar pelo menu — o foco que um `focus()`
         não conseguiu pôr aqui dentro. É o mesmo sinal que o `Modal` usa. */
      data-modal-open
      onKeyDown={onKeyDown}
      /* O menu mora sobre uma linha clicável e, no portal, o evento sintético
         ainda sobe pela árvore do React até ela: escolher um item também a
         selecionaria ou abriria a edição. */
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "fixed",
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        // Invisível até ser medido: o primeiro quadro, em 0,0, piscaria no canto.
        visibility: position ? "visible" : "hidden",
      }}
      className="z-[9999] flex w-50 flex-col rounded-control border border-border-subtle bg-raised p-1 shadow-(--shadow-overlay) outline-none"
    >
      {children}
    </div>,
    document.body
  );
}

interface MenuItemButtonsProps {
  entries: MenuEntry[];
  onChoose: (item: MenuItem, trigger: HTMLElement) => void;
  /** Índice do item cujo submenu está aberto — o que ele anuncia como expandido. */
  openIndex?: number | null;
  /** O hover de um item, que no menu de cima é o que abre e fecha o submenu. */
  onHover?: (index: number, item: MenuItem, trigger: HTMLElement) => void;
}

/** A lista de botões de um painel: a mesma no menu e no submenu. */
export function MenuItemButtons({
  entries,
  onChoose,
  openIndex = null,
  onHover,
}: MenuItemButtonsProps) {
  return (
    <>
      {entries.map((entry, i) =>
        entry === MENU_DIVIDER ? (
          <div key={i} role="separator" className="my-1 border-t border-border-subtle" />
        ) : (
          <button
            key={i}
            type="button"
            role="menuitem"
            data-menu-index={i}
            disabled={entry.disabled}
            tabIndex={-1}
            aria-haspopup={entry.children ? "menu" : undefined}
            aria-expanded={entry.children ? openIndex === i : undefined}
            onClick={(e) => onChoose(entry, e.currentTarget)}
            /* Mouse e teclado dividem um destaque só: o hover move o foco, e por
               isso não há `hover:` — com ele, o mouse parado num item e a seta
               em outro acenderiam dois. O destaque é `border`, e não `surface`:
               sobre `raised`, `surface` é mais escuro por 0,025 de L no modo
               escuro (o "não pinta nada" do `index.css`) e é branco no claro,
               mais claro que o painel. `border-subtle` fica a 0,037 no claro,
               no limite, e é o tom da própria borda e do divisor; `border`
               abre 0,09/0,067 e é o que o `TagMultiSelect` já usa sobre `raised`. */
            onMouseEnter={(e) => {
              e.currentTarget.focus({ preventScroll: true });
              onHover?.(i, entry, e.currentTarget);
            }}
            className={`flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm font-medium outline-none focus:bg-border disabled:cursor-not-allowed disabled:opacity-40 ${entry.tone === "danger" ? "text-danger" : "text-fg"}`}
          >
            {entry.icon && <span className="inline-flex shrink-0">{entry.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && (
              <span className="shrink-0 font-mono text-micro text-fg-muted">{entry.shortcut}</span>
            )}
            {/* O item que abre submenu não tem atalho: quem o descreve é a seta. */}
            {entry.children && (
              <ChevronRight size={14} className="shrink-0 text-fg-muted" aria-hidden />
            )}
          </button>
        )
      )}
    </>
  );
}
