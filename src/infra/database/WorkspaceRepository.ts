import { getDb } from "./db";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import type { IWorkspaceDataPort } from "@domain/repositories/IWorkspaceDataPort";
import type { Workspace } from "@domain/entities/Workspace";
import type { UUID } from "@shared/types";

interface WorkspaceRow {
  id: string;
  name: string;
  color: string;
  created_at: string;
}

function rowToWorkspace(r: WorkspaceRow): Workspace {
  return { id: r.id, name: r.name, color: r.color, createdAt: r.created_at };
}

/** Tabelas escopadas por workspace, na ordem em que devem ser apagadas. */
const SCOPED_TABLES = ["tasks", "planned_tasks", "export_profiles", "projects", "categories"];

export class WorkspaceRepository implements IWorkspaceRepository, IWorkspaceDataPort {
  async findAll(): Promise<Workspace[]> {
    const db = await getDb();
    const rows = await db.select<WorkspaceRow[]>(
      "SELECT * FROM workspaces ORDER BY created_at ASC"
    );
    return rows.map(rowToWorkspace);
  }

  async findById(id: UUID): Promise<Workspace | null> {
    const db = await getDb();
    const rows = await db.select<WorkspaceRow[]>("SELECT * FROM workspaces WHERE id = $1", [id]);
    return rows[0] ? rowToWorkspace(rows[0]) : null;
  }

  async findByName(name: string): Promise<Workspace | null> {
    const db = await getDb();
    const rows = await db.select<WorkspaceRow[]>("SELECT * FROM workspaces WHERE name = $1", [
      name,
    ]);
    return rows[0] ? rowToWorkspace(rows[0]) : null;
  }

  async save(workspace: Workspace): Promise<void> {
    const db = await getDb();
    await db.execute(
      "INSERT INTO workspaces (id, name, color, created_at) VALUES ($1, $2, $3, $4)",
      [workspace.id, workspace.name, workspace.color, workspace.createdAt]
    );
  }

  async update(id: UUID, name: string, color: string): Promise<void> {
    const db = await getDb();
    await db.execute("UPDATE workspaces SET name = $1, color = $2 WHERE id = $3", [
      name,
      color,
      id,
    ]);
  }

  async delete(id: UUID): Promise<void> {
    const db = await getDb();
    await db.execute("DELETE FROM workspaces WHERE id = $1", [id]);
  }

  // ─── IWorkspaceDataPort ───────────────────────────────────────────────────

  /**
   * Reatribui todo o conteúdo de um workspace para outro.
   *
   * Projetos e categorias vão por último e podem colidir com o
   * `UNIQUE(workspace_id, name)` do destino, que é exatamente o caso em que o
   * nome já existe lá: nesses, as tarefas são reapontadas para o item homônimo
   * do destino e o item de origem é descartado, em vez de duplicar o catálogo.
   */
  async moveAll(fromWorkspaceId: UUID, toWorkspaceId: UUID): Promise<void> {
    const db = await getDb();

    for (const table of ["projects", "categories"]) {
      const column = table === "projects" ? "project_id" : "category_id";
      // Reaponta as referências cujo nome já existe no destino.
      for (const referencing of ["tasks", "planned_tasks"]) {
        await db.execute(
          `UPDATE ${referencing} SET ${column} = (
             SELECT d.id FROM ${table} d
             JOIN ${table} o ON o.name = d.name
             WHERE o.id = ${referencing}.${column}
               AND d.workspace_id = $1
           )
           WHERE workspace_id = $2
             AND ${column} IN (
               SELECT o.id FROM ${table} o
               JOIN ${table} d ON d.name = o.name AND d.workspace_id = $1
               WHERE o.workspace_id = $2
             )`,
          [toWorkspaceId, fromWorkspaceId]
        );
      }
      // Descarta os homônimos da origem, já sem referências.
      await db.execute(
        `DELETE FROM ${table}
         WHERE workspace_id = $2
           AND name IN (SELECT name FROM ${table} WHERE workspace_id = $1)`,
        [toWorkspaceId, fromWorkspaceId]
      );
    }

    for (const table of SCOPED_TABLES) {
      await db.execute(`UPDATE ${table} SET workspace_id = $1 WHERE workspace_id = $2`, [
        toWorkspaceId,
        fromWorkspaceId,
      ]);
    }
  }

  /**
   * Apaga todo o conteúdo de um workspace. Tarefas e planejadas primeiro: os
   * `ON DELETE SET NULL` de `project_id`/`category_id` não protegem de nada aqui,
   * mas apagar as folhas antes deixa o estado intermediário coerente.
   */
  async deleteAll(workspaceId: UUID): Promise<void> {
    const db = await getDb();
    for (const table of SCOPED_TABLES) {
      await db.execute(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
    }
  }
}
