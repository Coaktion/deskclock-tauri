import { ArrowUpRight, FolderOpen, Globe } from "lucide-react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { executeActions } from "@domain/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

/**
 * O que o chip escreve: o nome dado à ação, ou — na ação sem nome, que é toda
 * a que foi criada antes do campo existir — o rótulo derivado do próprio valor,
 * hostname na URL e nome do arquivo no caminho.
 */
export function actionLabel(action: PlannedTaskAction): string {
  const named = action.label?.trim();
  if (named) return named;

  if (action.type === "open_url") {
    try {
      const normalized = action.value.startsWith("http") ? action.value : `https://${action.value}`;
      return new URL(normalized).hostname.replace(/^www\./, "");
    } catch {
      return action.value;
    }
  }
  const parts = action.value.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || action.value;
}

interface ActionChipProps {
  action: PlannedTaskAction;
}

export function ActionChip({ action }: ActionChipProps) {
  return (
    <button
      type="button"
      onClick={() =>
        void executeActions([action], { openUrl: openInBrowser, openPath: openInFileManager })
      }
      title={action.value}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border border-accent/25 bg-accent/5 text-accent-text hover:border-accent/50 hover:bg-accent/10 transition-colors"
    >
      {action.type === "open_url" ? (
        <Globe size={14} className="shrink-0" />
      ) : (
        <FolderOpen size={14} className="shrink-0" />
      )}
      {/* Nome escrito à mão é mais largo que o hostname que ele substitui, e o
          card do popup tem 264px: sem teto, duas ações nomeadas quebram a faixa
          em duas linhas. O valor inteiro fica no `title`. */}
      <span className="truncate max-w-[9rem]">{actionLabel(action)}</span>
      <ArrowUpRight size={14} className="shrink-0" />
    </button>
  );
}
