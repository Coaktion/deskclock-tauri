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
}

export function Autocomplete({
  value,
  onChange,
  onSelect,
  onEnter,
  options,
  placeholder = "",
  className = "",
}: AutocompleteProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = value
    ? options.filter((o) => o.name.toLowerCase().includes(value.toLowerCase()))
    : options;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (open && filtered.length > 0) {
        const first = filtered[0];
        onChange(first.name);
        onSelect?.(first);
        setOpen(false);
      } else {
        setOpen(false);
        onEnter?.();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
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
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-gray-800 border border-gray-700 rounded shadow-lg max-h-40 overflow-y-auto">
          {filtered.map((o) => (
            <li
              key={o.id}
              onMouseDown={() => handleSelect(o)}
              className="px-2.5 py-1.5 text-sm text-gray-200 hover:bg-gray-700 cursor-pointer"
            >
              {o.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
