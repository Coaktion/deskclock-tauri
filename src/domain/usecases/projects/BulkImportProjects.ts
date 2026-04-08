import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import { createProject } from "./CreateProject";

export async function bulkImportProjects(
  repository: IProjectRepository,
  rawText: string
): Promise<{ created: number; skipped: string[] }> {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let created = 0;
  const skipped: string[] = [];

  for (const line of lines) {
    try {
      await createProject(repository, line);
      created++;
    } catch {
      skipped.push(line);
    }
  }

  return { created, skipped };
}
