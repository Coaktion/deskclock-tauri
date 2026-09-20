import { useState, type MouseEvent } from "react";
import type { MenuAnchor, MenuEntry } from "@presentation/components/ui";

interface RowMenuOptions {
  /** Os itens da tela: cada lista tem os seus (ver "Por superfície" no spec). */
  items: MenuEntry[];
  /**
   * O modo de seleção. Nele não há menu, e o que estiver aberto **fecha** — só
   * esconder deixaria a âncora viva, e o menu reapareceria ao sair do modo.
   */
  disabled?: boolean;
}

/**
 * O menu de uma linha de lista: os itens e onde ele está aberto. O ⋯ e o
 * clique direito abrem **o mesmo** menu — ancorado ao botão num caso, ao ponto
 * do clique no outro. Os itens passam por aqui só para a tela entregar ao
 * `Menu` um objeto só.
 */
export function useRowMenu({ items, disabled = false }: RowMenuOptions) {
  // A âncora é também o estado de aberto do menu (`null` é fechado).
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  // Ajuste de estado durante o render, o padrão do React para "estado que
  // depende de prop": num efeito, o menu chegaria a um quadro aberto.
  if (disabled && anchor !== null) setAnchor(null);

  /** O ⋯ alterna: clicado com o menu aberto, fecha. */
  function toggleFrom(trigger: HTMLElement | null) {
    setAnchor((open) => (open ? null : trigger));
  }

  function openAtPointer(e: MouseEvent) {
    e.preventDefault();
    setAnchor({ x: e.clientX, y: e.clientY });
  }

  return {
    anchor,
    /** Aberto pelo ⋯, e não pelo clique direito: é o que o ⋯ anuncia como pressionado. */
    fromTrigger: anchor instanceof HTMLElement,
    items,
    toggleFrom,
    openAtPointer,
    close: () => setAnchor(null),
  };
}
