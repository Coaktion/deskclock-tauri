import type { ReactNode } from "react";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  /** Rótulo do atalho **e** a tecla que o escolhe com o menu aberto: `"E"`, `"Del"`. */
  shortcut?: string;
  tone?: "danger";
  disabled?: boolean;
  /**
   * O submenu do item. Com filhos o item deixa de **agir**: ele abre a lista —
   * no hover e pelo teclado — e quem age é o filho escolhido. É por isso que o
   * `onSelect` é opcional: item com filhos não tem o que executar.
   */
  children?: MenuItem[];
  onSelect?: () => void;
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
