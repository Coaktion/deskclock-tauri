import { useState, type MouseEvent } from "react";
import { Copy, Link, Pencil, Trash2 } from "lucide-react";
import { MENU_DIVIDER, type MenuAnchor, type MenuEntry } from "@presentation/components/ui";

interface PlannedRowMenuActions {
  onEdit: () => void;
  onDuplicate: () => void;
  onCopyLink: () => void;
  onDelete: () => void;
  /**
   * O modo de seleção. Nele não há menu, e o que estiver aberto **fecha** — só
   * esconder deixaria a âncora viva, e o menu reapareceria ao sair do modo.
   */
  disabled?: boolean;
}

/**
 * O menu da linha planejada: os itens e onde ele está aberto. O ⋯ e o clique
 * direito abrem **o mesmo** menu — ancorado ao botão num caso, ao ponto do
 * clique no outro —, e os atalhos dos itens são os mesmos que a linha focada
 * aceita (`plannedRowKey`).
 */
export function usePlannedRowMenu({
  onEdit,
  onDuplicate,
  onCopyLink,
  onDelete,
  disabled = false,
}: PlannedRowMenuActions) {
  // A âncora é também o estado de aberto do menu (`null` é fechado).
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  // Ajuste de estado durante o render, o padrão do React para "estado que
  // depende de prop": num efeito, o menu chegaria a um quadro aberto.
  if (disabled && anchor !== null) setAnchor(null);

  const items: MenuEntry[] = [
    { label: "Editar", icon: <Pencil size={14} />, shortcut: "E", onSelect: onEdit },
    { label: "Duplicar", icon: <Copy size={14} />, shortcut: "D", onSelect: onDuplicate },
    { label: "Copiar link", icon: <Link size={14} />, shortcut: "L", onSelect: onCopyLink },
    MENU_DIVIDER,
    {
      label: "Excluir",
      icon: <Trash2 size={14} />,
      shortcut: "Del",
      tone: "danger",
      onSelect: onDelete,
    },
  ];

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
