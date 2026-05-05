import type { PlannedTaskAction } from "@domain/entities/PlannedTask";

export function normalizeUrl(url: string): string {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }
  return url;
}

interface Opener {
  openUrl: (url: string) => Promise<void>;
  openPath: (path: string) => Promise<void>;
}

export async function executeActions(actions: PlannedTaskAction[], opener: Opener): Promise<void> {
  for (const action of actions) {
    if (action.type === "open_url") {
      await opener.openUrl(normalizeUrl(action.value));
    } else if (action.type === "open_file") {
      await opener.openPath(action.value);
    }
  }
}
