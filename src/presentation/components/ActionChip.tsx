import { ArrowUpRight, FolderOpen, Globe } from "lucide-react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { executeActions } from "@domain/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

function actionLabel(action: PlannedTaskAction): string {
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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border border-accent/25 bg-accent/5 text-accent-text hover:border-accent/50 hover:bg-accent/10 transition-colors"
    >
      {action.type === "open_url" ? <Globe size={14} /> : <FolderOpen size={14} />}
      {actionLabel(action)}
      <ArrowUpRight size={14} />
    </button>
  );
}
