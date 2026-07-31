import { WORKSPACE_COLORS, type WorkspaceColor } from "@domain/utils/workspaceColor";

/**
 * Classes por slot da paleta, escritas por extenso de propósito.
 *
 * O Tailwind resolve classes varrendo o código-fonte, então `bg-${slot}-500`
 * montado em runtime não geraria CSS nenhum. Este mapa é a ponte entre o slot
 * que o domínio devolve (`workspaceColorFor`) e a classe que existe de fato.
 */
const CLASSES: Record<WorkspaceColor, { dot: string; soft: string; text: string }> = {
  rose: { dot: "bg-rose-500", soft: "bg-rose-500/10 border-rose-500/40", text: "text-rose-400" },
  orange: {
    dot: "bg-orange-500",
    soft: "bg-orange-500/10 border-orange-500/40",
    text: "text-orange-400",
  },
  amber: {
    dot: "bg-amber-500",
    soft: "bg-amber-500/10 border-amber-500/40",
    text: "text-amber-400",
  },
  lime: { dot: "bg-lime-500", soft: "bg-lime-500/10 border-lime-500/40", text: "text-lime-400" },
  teal: { dot: "bg-teal-500", soft: "bg-teal-500/10 border-teal-500/40", text: "text-teal-400" },
  cyan: { dot: "bg-cyan-500", soft: "bg-cyan-500/10 border-cyan-500/40", text: "text-cyan-400" },
  violet: {
    dot: "bg-violet-500",
    soft: "bg-violet-500/10 border-violet-500/40",
    text: "text-violet-400",
  },
  fuchsia: {
    dot: "bg-fuchsia-500",
    soft: "bg-fuchsia-500/10 border-fuchsia-500/40",
    text: "text-fuchsia-400",
  },
};

const FALLBACK = CLASSES[WORKSPACE_COLORS[0]];

/** Classes de um slot; cai no primeiro da paleta se o valor persistido for desconhecido. */
export function workspaceClasses(color: string) {
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
