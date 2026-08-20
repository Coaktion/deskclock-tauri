import { getDb } from "./db";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";

interface ProjectRow {
  id: string;
  workspace_id: string;
  name: string;
  color_index: number;
}

function rowToProject(r: ProjectRow): Project {
  return {
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    colorIndex: r.color_index,
  };
}

export class ProjectRepository implements IProjectRepository {
  async findAll(workspaceId?: UUID): Promise<Project[]> {
    const db = await getDb();
    const rows = workspaceId
      ? await db.select<ProjectRow[]>(
          "SELECT id, workspace_id, name, color_index FROM projects WHERE workspace_id = $1 ORDER BY name ASC",
          [workspaceId]
        )
      : await db.select<ProjectRow[]>(
          "SELECT id, workspace_id, name, color_index FROM projects ORDER BY name ASC"
        );
    return rows.map(rowToProject);
  }

  async findByName(name: string, workspaceId: UUID): Promise<Project | null> {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>(
      "SELECT id, workspace_id, name, color_index FROM projects WHERE name = $1 AND workspace_id = $2",
      [name, workspaceId]
    );
    return rows[0] ? rowToProject(rows[0]) : null;
  }

  async save(project: Project): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO projects (id, workspace_id, name, color_index) VALUES ($1, $2, $3, $4)",
      [project.id, project.workspaceId, project.name, project.colorIndex]
    );
  }

  async update(id: UUID, name: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE projects SET name = $1 WHERE id = $2", [name, id]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM projects WHERE id = $1", [id]);
  }

  async deleteMany(ids: UUID[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await getDb();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
    await db.execute(`DELETE FROM projects WHERE id IN (${placeholders})`, ids);
  }
}
