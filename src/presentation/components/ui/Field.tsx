import type { ReactNode } from "react";

/**
 * Campo com rótulo encaixado na borda. O controle vai como filho, sem casca
 * própria — quem desenha fundo, borda e raio é a caixa, e é por isso que o
 * campo lê como uma coisa só quando divide a linha com um botão. O controle é
 * um `<Input variant="bare">` (ou `Select`/`Textarea` no mesmo variante).
 *
 * **Sob `space-y-*`:** o `mt-1.5` que compensa a subida do rótulo é escrito no
 * próprio elemento, então *substitui* a margem do `space-y` em vez de somar.
 * Sendo filho direto de um container com `space-y-*`, envolva num `<div>`.
 */
interface FieldProps {
  label: string;
  /** Sem ele, o clique no rótulo não foca o campo. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, children, className = "" }: FieldProps) {
  return (
    <div
      className={`relative mt-1.5 bg-raised border border-border rounded-control focus-within:border-accent transition-colors ${className}`}
    >
      {/* O fundo do rótulo precisa ser o da caixa: é ele que apaga o trecho de
          borda por baixo. Divergindo, sobra um risco atravessando o texto. */}
      <label
        htmlFor={htmlFor}
        className="absolute -top-2 left-1.5 px-1 bg-raised text-xs text-fg-muted rounded-sm"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
