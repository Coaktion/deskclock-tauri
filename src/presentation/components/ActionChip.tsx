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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border border-blue-500/25 bg-blue-500/[0.06] text-blue-400 hover:border-blue-500/50 hover:bg-blue-500/[0.12] hover:text-blue-300 transition-colors"
    >
      {action.type === "open_url" ? <Globe size={10} /> : <FolderOpen size={10} />}
      {actionLabel(action)}
      <ArrowUpRight size={9} />
    </button>
  );
}
