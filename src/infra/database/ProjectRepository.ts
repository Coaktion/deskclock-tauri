import { getDb } from "./db";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { Project } from "@domain/entities/Project";
import type { UUID } from "@shared/types";

interface ProjectRow {
  id: string;
  name: string;
}

export class ProjectRepository implements IProjectRepository {
  async findAll(): Promise<Project[]> {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>("SELECT id, name FROM projects ORDER BY name ASC");
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async findByName(name: string): Promise<Project | null> {
    const db = await getDb();
    const rows = await db.select<ProjectRow[]>("SELECT id, name FROM projects WHERE name = $1", [
      name,
    ]);
    return rows[0] ? { id: rows[0].id, name: rows[0].name } : null;
  }

  async save(project: Project): Promise<void> {
    const db = await getDb();
    await db.execute("INSERT INTO projects (id, name) VALUES ($1, $2)", [project.id, project.name]);
  }

  async update(id: UUID, name: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE projects SET name = $1 WHERE id = $2", [name, id]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM projects WHERE id = $1", [id]);
  }
}
