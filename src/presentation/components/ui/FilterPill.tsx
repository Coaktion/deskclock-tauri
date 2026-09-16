import type { ReactNode } from "react";

interface FilterPillProps {
  /**
   * Ausente, a pílula **não é de estado**: ela dispara e volta ao que era, e
   * nada de `aria-pressed` é emitido. É a diferença entre o filtro que fica
   * aceso e o gatilho que executa (o ⚡ de uma ação só).
   */
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  icon?: ReactNode;
  size?: "sm" | "md";
  /** Ponto no canto — o "hoje" da linha de dias do Planejamento. */
  marker?: boolean;
  /** Realce discreto sem estar ativa: o dia de hoje ainda não filtrado. */
  highlighted?: boolean;
  disabled?: boolean;
  title?: string;
  /**
   * Nome acessível, para quando o conteúdo não serve como nome — uma contagem,
   * um glifo. Pela regra de accname o conteúdo textual vence o `title`, então
   * `title` sozinho não corrige a pílula cujo miolo é um número.
   */
  "aria-label"?: string;
  className?: string;
}

const SIZE = {
  sm: "px-2.5 py-1",
  md: "px-3 py-1.5",
} as const;

export function FilterPill({
  active,
  onClick,
  children,
  count,
  icon,
  size = "md",
  marker = false,
  highlighted = false,
  disabled = false,
  title,
  "aria-label": ariaLabel,
  className = "",
}: FilterPillProps) {
  // A aparência continua tendo dois estados só — quem não declara `active` é
  // desenhada como apagada, exatamente como antes. O que a ausência muda é a
  // semântica, logo abaixo.
  const state = active
    ? "bg-accent/10 border-accent/40 text-accent-text"
    : highlighted
      ? "bg-transparent border-accent/20 text-fg-secondary hover:border-accent/40"
      : "bg-transparent border-border text-fg-muted hover:text-fg hover:border-fg-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      // `undefined` não emite o atributo: é assim que a pílula que só dispara
      // deixa de se anunciar como um toggle eternamente não pressionado.
      aria-pressed={active}
      className={`relative inline-flex items-center gap-1.5 ${SIZE[size]} text-sm font-medium border rounded-full whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${state} ${className}`}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className={active ? "text-accent-text/60" : "text-fg-muted"}>{count}</span>
      )}
      {marker && (
        <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-accent rounded-full" />
      )}
    </button>
  );
}
