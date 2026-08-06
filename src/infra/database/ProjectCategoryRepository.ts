import { getDb } from "./db";
import type { IProjectCategoryRepository } from "@domain/repositories/IProjectCategoryRepository";
import type { ProjectCategory, ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";

interface ProjectCategoryRow {
  project_id: string;
  category_id: string;
  source: string;
  created_at: string;
}

function rowToProjectCategory(r: ProjectCategoryRow): ProjectCategory {
  return {
    projectId: r.project_id,
    categoryId: r.category_id,
    source: r.source as ProjectCategorySource,
    createdAt: r.created_at,
  };
}

const SELECT_COLUMNS = "project_id, category_id, source, created_at";

export class ProjectCategoryRepository implements IProjectCategoryRepository {
  async findByProject(projectId: UUID): Promise<ProjectCategory[]> {
    const db = await getDb();
    const rows = await db.select<ProjectCategoryRow[]>(
      `SELECT ${SELECT_COLUMNS} FROM project_categories WHERE project_id = $1`,
      [projectId]
    );
    return rows.map(rowToProjectCategory);
  }

  async findAll(workspaceId?: UUID): Promise<ProjectCategory[]> {
    const db = await getDb();
    // O workspace mora em `projects`, não aqui (ver o comentário da migration 016).
    const rows = workspaceId
      ? await db.select<ProjectCategoryRow[]>(
          `SELECT pc.project_id, pc.category_id, pc.source, pc.created_at
             FROM project_categories pc
             JOIN projects p ON p.id = pc.project_id
            WHERE p.workspace_id = $1`,
          [workspaceId]
        )
      : await db.select<ProjectCategoryRow[]>(`SELECT ${SELECT_COLUMNS} FROM project_categories`);
    return rows.map(rowToProjectCategory);
  }

  async setManual(projectId: UUID, categoryIds: UUID[]): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM project_categories WHERE project_id = $1 AND source = 'manual'", [
      projectId,
    ]);
    await this.insertIgnoring(projectId, categoryIds, "manual");
  }

  async replaceMondayFor(projectId: UUID, categoryIds: UUID[]): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM project_categories WHERE project_id = $1 AND source = 'monday'", [
      projectId,
    ]);
    await this.insertIgnoring(projectId, categoryIds, "monday");
  }

  /**
   * `INSERT OR IGNORE` porque o par pode já existir com a **outra** origem, e
   * quem está gravando não é dono dela: a varredura do Monday não rebaixa o que
   * o usuário associou à mão, e o usuário não reivindica o que a varredura
   * semeou. Sem o `OR IGNORE` isso seria um erro de PK, não uma preservação.
   */
  private async insertIgnoring(
    projectId: UUID,
    categoryIds: UUID[],
    source: ProjectCategorySource
  ): Promise<void> {
    if (categoryIds.length === 0) return;
    const db = await getDb();
    const createdAt = new Date().toISOString();
    const values = categoryIds.map((_, i) => `($1, $${i + 4}, $2, $3)`).join(", ");
    await db.execute(
      `INSERT OR IGNORE INTO project_categories (project_id, category_id, source, created_at) VALUES ${values}`,
      [projectId, source, createdAt, ...categoryIds]
    );
  }
}
