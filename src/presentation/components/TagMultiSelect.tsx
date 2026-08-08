import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

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
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  }

  function openDropdown() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropStyle({
        position: "fixed",
        top: r.bottom + 4,
        right: window.innerWidth - r.right,
        minWidth: r.width,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const selected = allTags.filter((t) => selectedIds.includes(t.id));

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="flex flex-wrap items-center gap-1 min-w-[180px] max-w-[260px] bg-raised border border-border rounded px-2 py-1 text-xs text-left focus:outline-none focus:border-accent"
      >
        {selected.length === 0 ? (
          <span className="text-fg-muted">{placeholder}</span>
        ) : (
          selected.map((t) => (
            <span key={t.id} className="bg-border text-fg px-1.5 py-0.5 rounded text-xs">
              {t.name}
            </span>
          ))
        )}
        <ChevronDown size={11} className="ml-auto shrink-0 text-fg-muted" />
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
                  <span className="text-xs text-fg">{t.name}</span>
                </label>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
