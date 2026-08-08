import type { ReactNode } from "react";

/**
 * Ação sem texto — o ✎ e o 🗑 das linhas, o ‹ › da navegação de data, o ↻ das
 * seções de integração. O padrão estava copiado em dezenas de lugares e divergia
 * no padding e no que acontece ao passar o cursor.
 *
 * A cor é o **destino** da ação, não o estado de repouso: em repouso todas são
 * `fg-muted`, e é o hover que diz se aquilo edita, navega ou apaga.
 */
export type IconButtonVariant = "accent" | "neutral" | "danger";
export type IconButtonSize = "sm" | "md";

const VARIANT: Record<IconButtonVariant, string> = {
  accent: "text-fg-muted hover:text-accent-text hover:bg-accent/10",
  neutral: "text-fg-muted hover:text-fg hover:bg-raised",
  danger: "text-fg-muted hover:text-danger hover:bg-danger/10",
};

const SIZE: Record<IconButtonSize, string> = {
  sm: "p-1",
  md: "p-1.5",
};

interface IconButtonProps {
  icon: ReactNode;
  /**
   * Tooltip **e** nome acessível, obrigatório: o botão não tem texto, e sem ele
   * o leitor de tela anuncia "botão" e mais nada.
   */
  title: string;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  className?: string;
}

export function IconButton({
  icon,
  title,
  onClick,
  type = "button",
  variant = "accent",
  size = "md",
  disabled = false,
  className = "",
}: IconButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex items-center justify-center shrink-0 rounded-control transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${className}`}
    >
      {icon}
    </button>
  );
}
