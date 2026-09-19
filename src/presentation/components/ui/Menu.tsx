import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";

import { MenuItemButtons, MenuPanel, menuItemsIn } from "./MenuPanel";
import { MENU_DIVIDER, type MenuAnchor, type MenuEntry, type MenuItem } from "./menuTypes";

export { MENU_DIVIDER } from "./menuTypes";
export type { MenuAnchor, MenuEntry, MenuItem } from "./menuTypes";

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

/** O submenu aberto: qual item o abriu, por onde, e o botão dele. */
interface OpenSubmenu {
  item: MenuItem;
  trigger: HTMLElement;
  /** Aberto pelo teclado foca o primeiro filho; pelo hover, o foco fica no pai. */
  byKeyboard: boolean;
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
 *
 * **Item com `children` abre submenu** (a seção de ações, H1): no hover do item
 * e, pelo teclado, com `→`, `Enter` ou `Espaço`; `←` volta ao menu de cima e
 * `Esc` ali dentro fecha só o submenu. O menu de cima **fica aberto** enquanto o
 * submenu está; escolher um filho fecha os dois pelo mesmo `onClose`.
 */
export function Menu({ anchor, items, onClose, label }: MenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const subPanelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const [submenu, setSubmenu] = useState<OpenSubmenu | null>(null);
  // O `onClose` do chamador é quase sempre uma arrow nova a cada render; em ref,
  // os listeners não se refazem a cada render do pai.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    // Reancorado ou fechado, o gatilho do submenu anterior já não está na tela.
    // O `null` só volta quando há o que fechar: um `setState` a cada reancoragem
    // tiraria do React o cálculo adiantado do estado do **chamador**, e o ⋯ que
    // lê o gatilho do próprio evento reabriria com ele já limpo.
    setSubmenu((open) => (open === null ? open : null));
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    // Reancorado com o menu já aberto, o foco está num item; guardá-lo mandaria
    // o foco, ao fechar, para um botão que acabou de sair do DOM.
    if (!panel.contains(document.activeElement)) restoreRef.current = restoreTarget(anchor);
  }, [anchor]);

  useEffect(() => {
    if (!anchor) return;

    function handleOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      // O submenu é outro portal: sem esta guarda, clicar numa ação fecharia o
      // menu antes de o clique chegar ao item.
      if (subPanelRef.current?.contains(target)) return;
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

  /** Fecha só o submenu e devolve o foco ao item que o abriu. */
  function closeSubmenu() {
    submenu?.trigger.focus({ preventScroll: true });
    setSubmenu(null);
  }

  // Fecha **antes** de executar: o item que abre um modal foca o campo dele, e
  // devolver o foco ao gatilho depois disso o tiraria do modal.
  function choose(item: MenuItem, trigger: HTMLElement) {
    if (item.disabled) return;
    // Item com filhos não age: ele abre a lista, com o foco no primeiro filho.
    if (item.children) return setSubmenu({ item, trigger, byKeyboard: true });
    closeAndRestore();
    item.onSelect?.();
  }

  function move(panel: HTMLElement | null, e: KeyboardEvent, to: (i: number, n: number) => number) {
    e.preventDefault();
    const enabled = menuItemsIn(panel);
    if (enabled.length === 0) return;
    const current = enabled.indexOf(document.activeElement as HTMLElement);
    enabled[to(current, enabled.length)].focus({ preventScroll: true });
  }

  /** O item do menu de cima que está com o foco, se houver. */
  function focusedItem(): { item: MenuItem; el: HTMLElement } | null {
    const el = document.activeElement as HTMLElement | null;
    const index = el?.dataset.menuIndex;
    if (!el || index === undefined) return null;
    const entry = items[Number(index)];
    return entry && entry !== MENU_DIVIDER ? { item: entry, el } : null;
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Andar no menu de cima fecha o submenu: ele pertence ao item que ficou para
    // trás, e aberto sobre outro item descreveria um pai que não é o dele.
    const moveRoot = (to: (i: number, n: number) => number) => {
      setSubmenu(null);
      move(panelRef.current, e, to);
    };
    switch (e.key) {
      case "ArrowDown":
        return moveRoot((i, n) => (i + 1) % n);
      case "ArrowUp":
        return moveRoot((i, n) => (i <= 0 ? n - 1 : i - 1));
      case "Home":
        return moveRoot(() => 0);
      case "End":
        return moveRoot((_, n) => n - 1);
      case "ArrowRight": {
        const focused = focusedItem();
        if (!focused?.item.children) return;
        e.preventDefault();
        return setSubmenu({ item: focused.item, trigger: focused.el, byKeyboard: true });
      }
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
        const focused = focusedItem();
        if (focused) choose(focused.item, focused.el);
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
      choose(hit, document.activeElement as HTMLElement);
    }
  }

  function handleSubmenuKeyDown(e: KeyboardEvent) {
    /* O submenu é filho do painel de cima na árvore do React — o portal não muda
       isso —, então tudo o que ele trata **para** de subir: senão o ↓ andaria nas
       duas listas ao mesmo tempo e a letra de atalho do menu dispararia com o
       foco aqui dentro. */
    e.stopPropagation();
    const children = submenu?.item.children ?? [];
    switch (e.key) {
      case "ArrowDown":
        return move(subPanelRef.current, e, (i, n) => (i + 1) % n);
      case "ArrowUp":
        return move(subPanelRef.current, e, (i, n) => (i <= 0 ? n - 1 : i - 1));
      case "Home":
        return move(subPanelRef.current, e, () => 0);
      case "End":
        return move(subPanelRef.current, e, (_, n) => n - 1);
      case "ArrowLeft":
      case "Escape":
        // O ESC aqui volta um nível, e é consumido igual: contido pelo
        // `stopPropagation` acima, ele não chega ao `document` que esconde a janela.
        e.preventDefault();
        return closeSubmenu();
      case "Tab":
        e.preventDefault();
        return closeAndRestore();
      case "Enter":
      case " ": {
        e.preventDefault();
        const el = document.activeElement as HTMLElement | null;
        const index = el?.dataset.menuIndex;
        const child = index === undefined ? undefined : children[Number(index)];
        if (child && el) choose(child, el);
        return;
      }
    }
  }

  return (
    <MenuPanel
      anchor={anchor}
      label={label}
      autoFocus
      panelRef={panelRef}
      onKeyDown={handleKeyDown}
    >
      <MenuItemButtons
        entries={items}
        onChoose={choose}
        openIndex={submenu ? items.indexOf(submenu.item) : null}
        /* O hover abre o submenu do item que tem filhos e fecha o que estiver
           aberto ao passar por um que não tem — senão o painel ficaria pendurado
           sobre o menu enquanto o cursor já está noutro item. */
        onHover={(_, item, trigger) =>
          setSubmenu(item.children ? { item, trigger, byKeyboard: false } : null)
        }
      />
      {submenu && (
        <MenuPanel
          anchor={submenu.trigger}
          side
          label={submenu.item.label}
          autoFocus={submenu.byKeyboard}
          panelRef={subPanelRef}
          onKeyDown={handleSubmenuKeyDown}
        >
          <MenuItemButtons entries={submenu.item.children ?? []} onChoose={choose} />
        </MenuPanel>
      )}
    </MenuPanel>
  );
}
