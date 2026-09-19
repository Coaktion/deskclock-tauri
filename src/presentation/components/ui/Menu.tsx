import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Rótulo do atalho **e** a tecla que o escolhe com o menu aberto: `"E"`, `"Del"`. */
  shortcut?: string;
  tone?: "danger";
  disabled?: boolean;
  onSelect: () => void;
}

/** Divisor entre grupos de itens. Literal, e não objeto, porque não carrega nada. */
export const MENU_DIVIDER = "divider";
export type MenuEntry = MenuItem | typeof MENU_DIVIDER;

/**
 * O que o menu abre junto: o elemento do gatilho (o ⋯) ou o ponto do clique
 * direito. É também o estado de aberto — `null` é fechado —, então o chamador
 * guarda uma coisa só e não há como o menu estar aberto sem lugar para abrir.
 */
export type MenuAnchor = HTMLElement | { x: number; y: number };

interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Folga entre o gatilho e o menu. */
const GAP = 4;
/** Distância mínima da borda da janela. */
const EDGE = 4;

/**
 * Onde o menu cabe. O gatilho é o ⋯ no fim da linha, então o menu nasce com a
 * borda direita alinhada à dele e cresce para a esquerda, sobre a linha; do
 * ponto, nasce no cursor e cresce para a direita, como o menu de contexto do
 * sistema. Sem espaço, cada eixo vira para o outro lado, e o `clamp` final é a
 * rede para a janela menor que o próprio menu.
 */
export function placeMenu(
  anchor: { rect: Box } | { point: { x: number; y: number } },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  let left: number;
  let top: number;
  if ("rect" in anchor) {
    const r = anchor.rect;
    left = r.right - size.width < EDGE ? r.left : r.right - size.width;
    top =
      r.bottom + GAP + size.height > viewport.height - EDGE
        ? r.top - GAP - size.height
        : r.bottom + GAP;
  } else {
    const { x, y } = anchor.point;
    left = x + size.width > viewport.width - EDGE ? x - size.width : x;
    top = y + size.height > viewport.height - EDGE ? y - size.height : y;
  }
  const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max - EDGE));
  return {
    left: clamp(left, viewport.width - size.width),
    top: clamp(top, viewport.height - size.height),
  };
}

const KEY_ALIASES: Record<string, string> = { Del: "Delete" };

function matchesShortcut(shortcut: string, key: string): boolean {
  const expected = KEY_ALIASES[shortcut] ?? shortcut;
  return expected.length === 1 ? key.toLowerCase() === expected.toLowerCase() : key === expected;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Para onde o foco volta. O gatilho costuma ser um invólucro com `ref` em volta
 * do `IconButton`, que não expõe o dele, então o alvo é o focável de dentro.
 * Do clique direito não há gatilho, e volta-se para onde o foco estava.
 */
function restoreTarget(anchor: MenuAnchor): HTMLElement | null {
  if (anchor instanceof HTMLElement) {
    return anchor.matches(FOCUSABLE) ? anchor : anchor.querySelector<HTMLElement>(FOCUSABLE);
  }
  return document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

interface MenuProps {
  anchor: MenuAnchor | null;
  items: MenuEntry[];
  onClose: () => void;
  /** Nome acessível do menu ("Ações da tarefa"). */
  label?: string;
}

/**
 * Menu de ações, controlado pelo `anchor`. Vai para `document.body` por portal
 * pelo mesmo motivo do `PlannedActionsFlyout`: quem o hospeda mora em lista que
 * rola, e um painel `absolute` seria cortado pelo scroller.
 *
 * Não usa o `useAnchoredPanel`: aquele hook é dono do próprio `open`, ancora só
 * em elemento e posiciona sem medir o painel — e virar na borda exige a medida.
 * Estendê-lo para cá seria dar-lhe um segundo modo que os dois call sites dele
 * nunca usam.
 *
 * **O gatilho não fecha por clique-fora**: o `mousedown` nele é ignorado, e é o
 * `onClick` do chamador que alterna. Fechar ali e o clique reabrir em seguida
 * faria o ⋯ nunca fechar o próprio menu.
 */
export function Menu({ anchor, items, onClose, label }: MenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  // O `onClose` do chamador é quase sempre uma arrow nova a cada render; em ref,
  // os listeners não se refazem a cada render do pai.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!anchor || !panel) {
      setPosition(null);
      return;
    }
    // Reancorado com o menu já aberto, o foco está num item; guardá-lo mandaria
    // o foco, ao fechar, para um botão que acabou de sair do DOM.
    if (!panel.contains(document.activeElement)) restoreRef.current = restoreTarget(anchor);
    const size = { width: panel.offsetWidth, height: panel.offsetHeight };
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const placement =
      anchor instanceof HTMLElement ? { rect: anchor.getBoundingClientRect() } : { point: anchor };
    setPosition(placeMenu(placement, size, viewport));
  }, [anchor]);

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
    if (!visible || !panel) return;
    const first = panel.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])');
    (first ?? panel).focus({ preventScroll: true });
  }, [visible]);

  useEffect(() => {
    if (!anchor) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchor instanceof HTMLElement && anchor.contains(target)) return;
      onCloseRef.current();
    }
    function close() {
      onCloseRef.current();
    }

    document.addEventListener("mousedown", handleOutside);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    // Captura, porque `scroll` não borbulha e o scroller é um ancestral qualquer.
    window.addEventListener("scroll", close, { capture: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, { capture: true });
    };
  }, [anchor]);

  if (!anchor) return null;

  /**
   * Fechar pelo teclado ou por escolha devolve o foco; clique-fora, rolagem e
   * blur não, porque ali o usuário já pôs a atenção em outro lugar e puxar o
   * foco de volta a roubaria.
   */
  function closeAndRestore() {
    restoreRef.current?.focus({ preventScroll: true });
    onCloseRef.current();
  }

  // Fecha **antes** de executar: o item que abre um modal foca o campo dele, e
  // devolver o foco ao gatilho depois disso o tiraria do modal.
  function choose(item: MenuItem) {
    if (item.disabled) return;
    closeAndRestore();
    item.onSelect();
  }

  function move(e: React.KeyboardEvent, to: (index: number, count: number) => number) {
    e.preventDefault();
    const enabled = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []
    );
    if (enabled.length === 0) return;
    const current = enabled.indexOf(document.activeElement as HTMLElement);
    enabled[to(current, enabled.length)].focus({ preventScroll: true });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    switch (e.key) {
      case "ArrowDown":
        return move(e, (i, n) => (i + 1) % n);
      case "ArrowUp":
        return move(e, (i, n) => (i <= 0 ? n - 1 : i - 1));
      case "Home":
        return move(e, () => 0);
      case "End":
        return move(e, (_, n) => n - 1);
      case "Escape":
        // Consumido e contido (contratos nº1 e nº3): sem o `stopPropagation`,
        // o ESC chegaria ao `document`, onde `useGlobalShortcuts` esconde a
        // janela do app, e à `window`, onde o modal por baixo se fecharia junto.
        e.preventDefault();
        e.stopPropagation();
        return closeAndRestore();
      case "Tab":
        e.preventDefault();
        return closeAndRestore();
      case "Enter":
      case " ": {
        // O `preventDefault` segura o clique nativo do `<button>` (que viria
        // em dobro) e avisa o `useSubmitOnEnter` do container por baixo.
        e.preventDefault();
        const index = (document.activeElement as HTMLElement | null)?.dataset.menuIndex;
        const entry = index === undefined ? undefined : items[Number(index)];
        if (entry && entry !== MENU_DIVIDER) choose(entry);
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const hit = items.find(
      (entry): entry is MenuItem =>
        entry !== MENU_DIVIDER && !!entry.shortcut && matchesShortcut(entry.shortcut, e.key)
    );
    if (hit && !hit.disabled) {
      e.preventDefault();
      choose(hit);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={label}
      tabIndex={-1}
      /* O ESC já é contido acima; o atributo é a segunda guarda, para o ESC
         que chegue ao `document` sem passar pelo menu — o foco que um `focus()`
         não conseguiu pôr aqui dentro. É o mesmo sinal que o `Modal` usa. */
      data-modal-open
      onKeyDown={handleKeyDown}
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
      {items.map((entry, i) =>
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
            onClick={() => choose(entry)}
            /* Mouse e teclado dividem um destaque só: o hover move o foco, e por
               isso não há `hover:` — com ele, o mouse parado num item e a seta
               em outro acenderiam dois. O destaque é `border`, e não `surface`:
               sobre `raised`, `surface` é mais escuro por 0,025 de L no modo
               escuro (o "não pinta nada" do `index.css`) e é branco no claro,
               mais claro que o painel. `border-subtle` fica a 0,037 no claro,
               no limite, e é o tom da própria borda e do divisor; `border`
               abre 0,09/0,067 e é o que o `TagMultiSelect` já usa sobre `raised`. */
            onMouseEnter={(e) => e.currentTarget.focus({ preventScroll: true })}
            className={`flex w-full items-center gap-2 rounded-chip px-2 py-1.5 text-left text-sm font-medium outline-none focus:bg-border disabled:cursor-not-allowed disabled:opacity-40 ${entry.tone === "danger" ? "text-danger" : "text-fg"}`}
          >
            {entry.icon && <span className="inline-flex shrink-0">{entry.icon}</span>}
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
            {entry.shortcut && (
              <span className="shrink-0 font-mono text-micro text-fg-muted">{entry.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>,
    document.body
  );
}
