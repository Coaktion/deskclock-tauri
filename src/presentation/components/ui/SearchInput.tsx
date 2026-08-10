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
        // O anel de 3px é o foco da busca: ela mora acima de uma lista que se
        // reordena a cada tecla, e a troca de cor da borda sozinha some no meio
        // do movimento.
        className="pl-8 focus:ring-[3px] focus:ring-accent/15"
      />
    </div>
  );
}
