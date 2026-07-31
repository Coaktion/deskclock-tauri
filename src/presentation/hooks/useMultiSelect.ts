import { useCallback, useMemo, useState } from "react";
import type { UUID } from "@shared/types";

export interface UseMultiSelectResult {
  selected: Set<UUID>;
  count: number;
  allSelected: boolean;
  isSelected: (id: UUID) => boolean;
  toggle: (id: UUID) => void;
  toggleAll: () => void;
  unselect: (ids: UUID[]) => void;
  clear: () => void;
}

/**
 * Seleção múltipla genérica por id, sobre a lista de ids atualmente visíveis.
 *
 * A seleção efetiva é a interseção com `visibleIds`: filtrar a lista nunca deixa
 * selecionado algo que o usuário não está vendo. Isso importa porque a exclusão
 * em massa é imediata, sem confirmação (§1 do CLAUDE.md).
 */
export function useMultiSelect(visibleIds: UUID[]): UseMultiSelectResult {
  const [rawSelected, setRawSelected] = useState<Set<UUID>>(new Set());

  const selected = useMemo(() => {
    const visible = new Set(visibleIds);
    return new Set([...rawSelected].filter((id) => visible.has(id)));
  }, [rawSelected, visibleIds]);

  const toggle = useCallback((id: UUID) => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = visibleIds.length > 0 && selected.size === visibleIds.length;

  const toggleAll = useCallback(() => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      const everyVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => prev.has(id));
      for (const id of visibleIds) {
        if (everyVisibleSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [visibleIds]);

  const unselect = useCallback((ids: UUID[]) => {
    setRawSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setRawSelected(new Set()), []);

  const isSelected = useCallback((id: UUID) => selected.has(id), [selected]);

  return {
    selected,
    count: selected.size,
    allSelected,
    isSelected,
    toggle,
    toggleAll,
    unselect,
    clear,
  };
}
