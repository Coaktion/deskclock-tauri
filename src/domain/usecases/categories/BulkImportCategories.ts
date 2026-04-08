import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import { createCategory } from "./CreateCategory";

export async function bulkImportCategories(
  repository: ICategoryRepository,
  rawText: string
): Promise<{ created: number; skipped: string[] }> {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let created = 0;
  const skipped: string[] = [];

  for (const line of lines) {
    const isBillable = !line.startsWith("!");
    const name = isBillable ? line : line.slice(1).trim();
    try {
      await createCategory(repository, name, isBillable);
      created++;
    } catch {
      skipped.push(line);
    }
  }

  return { created, skipped };
}
