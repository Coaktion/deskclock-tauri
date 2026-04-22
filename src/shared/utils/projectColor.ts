const PROJECT_COLORS = [
  "#3b82f6", // blue
  "#a855f7", // purple
  "#10b981", // green
  "#f59e0b", // amber
  "#ec4899", // pink
  "#64748b", // slate
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getProjectColor(projectId: string | null | undefined): string {
  if (!projectId) return "#4b5563"; // gray-600
  return PROJECT_COLORS[hashString(projectId) % PROJECT_COLORS.length];
}
