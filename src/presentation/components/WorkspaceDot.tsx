import { WORKSPACE_COLORS, type WorkspaceColor } from "@domain/utils/workspaceColor";

interface SlotClasses {
  dot: string;
  soft: string;
  text: string;
  /** Origem do gradiente do compact overlay — ver `WorkspaceEdge`. */
  from: string;
}

/**
 * Classes por slot da paleta, escritas por extenso de propósito.
 *
 * O Tailwind resolve classes varrendo o código-fonte, então `bg-${slot}-500`
 * montado em runtime não geraria CSS nenhum. Este mapa é a ponte entre o slot
 * que o domínio devolve (`workspaceColorFor`) e a classe que existe de fato.
 */
const CLASSES: Record<WorkspaceColor, SlotClasses> = {
  rose: {
    dot: "bg-rose-500",
    soft: "bg-rose-500/10 border-rose-500/40",
    text: "text-rose-400",
    from: "from-rose-500/50",
  },
  orange: {
    dot: "bg-orange-500",
    soft: "bg-orange-500/10 border-orange-500/40",
    text: "text-orange-400",
    from: "from-orange-500/50",
  },
  amber: {
    dot: "bg-amber-500",
    soft: "bg-amber-500/10 border-amber-500/40",
    text: "text-amber-400",
    from: "from-amber-500/50",
  },
  lime: {
    dot: "bg-lime-500",
    soft: "bg-lime-500/10 border-lime-500/40",
    text: "text-lime-400",
    from: "from-lime-500/50",
  },
  teal: {
    dot: "bg-teal-500",
    soft: "bg-teal-500/10 border-teal-500/40",
    text: "text-teal-400",
    from: "from-teal-500/50",
  },
  cyan: {
    dot: "bg-cyan-500",
    soft: "bg-cyan-500/10 border-cyan-500/40",
    text: "text-cyan-400",
    from: "from-cyan-500/50",
  },
  violet: {
    dot: "bg-violet-500",
    soft: "bg-violet-500/10 border-violet-500/40",
    text: "text-violet-400",
    from: "from-violet-500/50",
  },
  fuchsia: {
    dot: "bg-fuchsia-500",
    soft: "bg-fuchsia-500/10 border-fuchsia-500/40",
    text: "text-fuchsia-400",
    from: "from-fuchsia-500/50",
  },
};

const FALLBACK = CLASSES[WORKSPACE_COLORS[0]];

/** Classes de um slot; cai no primeiro da paleta se o valor persistido for desconhecido. */
export function workspaceClasses(color: string): SlotClasses {
  return CLASSES[color as WorkspaceColor] ?? FALLBACK;
}

export function WorkspaceDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className={`inline-block rounded-full shrink-0 ${workspaceClasses(color).dot}`}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Faixa de cor do workspace no compact overlay: começa na borda esquerda e se
 * dissolve no fundo antes de 25% da largura.
 *
 * Preenche o card inteiro em vez de ser um elemento próprio para não disputar
 * espaço num overlay de 68px — o conteúdo fica por cima, e a cor só sinaliza.
 */
export function WorkspaceEdge({ color, className = "" }: { color: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={`absolute inset-0 pointer-events-none bg-gradient-to-r to-transparent to-25% ${workspaceClasses(color).from} ${className}`}
    />
  );
}
