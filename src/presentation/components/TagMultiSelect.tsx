import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { Badge } from "@presentation/components/ui";
import { useAnchoredPanel } from "@presentation/hooks/useAnchoredPanel";

export interface TagOption {
  id: string;
  name: string;
}

interface TagMultiSelectProps {
  allTags: TagOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function TagMultiSelect({
  allTags,
  selectedIds,
  onChange,
  placeholder = "Nenhuma tag",
}: TagMultiSelectProps) {
  /*
   * O gatilho é o próprio campo, então o painel copia a largura dele. Fora isso
   * o mecanismo é o mesmo do `PlannedActionsFlyout` (§9.4) — inclusive o fechar
   * no resize, que este dropdown não tinha: o `right` sai do `window.innerWidth`
   * do instante da abertura.
   */
  const {
    open,
    setOpen,
    triggerRef,
    panelRef: dropRef,
    panelStyle: dropStyle,
    openPanel: openDropdown,
  } = useAnchoredPanel<HTMLButtonElement>({ matchTriggerWidth: true });

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  const selected = allTags.filter((t) => selectedIds.includes(t.id));

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="flex flex-wrap items-center gap-1 min-w-[180px] max-w-[260px] bg-raised border border-border rounded-chip px-2 py-1 text-sm text-left focus:outline-none focus:border-accent"
      >
        {selected.length === 0 ? (
          <span className="text-fg-muted">{placeholder}</span>
        ) : (
          selected.map((t) => <Badge key={t.id}>{t.name}</Badge>)
        )}
        <ChevronDown size={14} className="ml-auto shrink-0 text-fg-muted" />
      </button>
      {open &&
        createPortal(
          <div
            ref={dropRef}
            style={dropStyle}
            className="z-[9999] bg-raised border border-border rounded-control shadow-xl w-52 max-h-48 overflow-y-auto"
          >
            {allTags.length === 0 ? (
              <p className="text-xs text-fg-muted px-3 py-2">Nenhuma tag disponível</p>
            ) : (
              allTags.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-border cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-fg">{t.name}</span>
                </label>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
