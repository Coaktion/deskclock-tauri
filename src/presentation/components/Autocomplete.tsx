import { useState, useRef, useEffect } from "react";

interface Option {
  id: string;
  name: string;
}

interface AutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (option: Option) => void;
  onEnter?: () => void;
  options: Option[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}

export function Autocomplete({
  value,
  onChange,
  onSelect,
  onEnter,
  options,
  placeholder = "",
  className = "",
  autoFocus = false,
}: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = value
    ? options.filter((o) => o.name.toLowerCase().includes(value.toLowerCase()))
    : options;

  // Reseta o índice ativo quando a lista muda
  useEffect(() => {
    setActiveIdx(0);
  }, [value]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Mantém o item ativo visível ao navegar com teclado
  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[activeIdx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0) {
        const chosen = filtered[activeIdx] ?? filtered[0];
        onChange(chosen.name);
        onSelect?.(chosen);
        setOpen(false);
      } else {
        setOpen(false);
        onEnter?.();
      }
    } else if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        e.preventDefault(); // sinaliza que o ESC foi consumido — impede window listeners de fechar o modal
        setOpen(false);
      }
    }
  }

  function handleSelect(option: Option) {
    onChange(option.name);
    onSelect?.(option);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-40 overflow-y-auto"
        >
          {filtered.map((o, idx) => (
            <li
              key={o.id}
              onMouseDown={() => handleSelect(o)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`px-2.5 py-1.5 text-sm cursor-pointer transition-colors ${
                idx === activeIdx
                  ? "bg-blue-600/40 text-gray-100"
                  : "text-gray-200 hover:bg-gray-700"
              }`}
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
