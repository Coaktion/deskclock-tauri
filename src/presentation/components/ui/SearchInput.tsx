import { Search } from "lucide-react";
import { Input } from "./Input";

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  ariaLabel?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Filtrar...",
  className = "",
  id,
  ariaLabel,
}: SearchInputProps) {
  return (
    <div className={`relative ${className}`}>
      <Search
        size={14}
        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
      />
      <Input
        id={id}
        role="searchbox"
        aria-label={ariaLabel ?? placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        // O padding à esquerda abre o lugar da lupa; o da direita vem do `size`.
        className="pl-8"
      />
    </div>
  );
}
