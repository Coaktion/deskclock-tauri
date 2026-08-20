import type { CustomValues } from "@domain/entities/CustomField";
import type { UUID } from "@shared/types";

/**
 * Subconjunto de `Database` do tauri-plugin-sql que este módulo usa. `select`
 * é declarado sem genérico de propósito: um mock simples de teste não satisfaz
 * uma assinatura genérica.
 */
export interface Queryable {
  select(query: string, values?: unknown[]): Promise<unknown>;
  execute(query: string, values?: unknown[]): Promise<unknown>;
}

interface ValueRow {
  owner_id: string;
  field_id: string;
  value: string;
}

/** Fechado em uniões literais: `table` e `ownerColumn` entram no SQL por
 *  interpolação e não podem aceitar string arbitrária de um chamador futuro. */
type ValueTable = "task_custom_values" | "planned_task_custom_values";
type OwnerColumn = "task_id" | "planned_task_id";

/** O SQLite limita as variáveis de uma query (999 nas builds antigas). Uma
 *  busca de histórico por um ano passa disso e quebraria a tela inteira. */
const MAX_IDS_PER_QUERY = 500;

/**
 * Costura os valores personalizados de uma leva de tarefas em **uma** query
 * pelos ids já carregados. Uma query por tarefa (N+1) apareceria em toda tela
 * de histórico e em todo envio diário de integração.
 */
export async function loadCustomValues(
  db: Queryable,
  table: ValueTable,
  ownerColumn: OwnerColumn,
  ids: UUID[]
): Promise<Map<UUID, CustomValues>> {
  const byOwner = new Map<UUID, CustomValues>();

  for (let i = 0; i < ids.length; i += MAX_IDS_PER_QUERY) {
    const chunk = ids.slice(i, i + MAX_IDS_PER_QUERY);
    const placeholders = chunk.map((_, idx) => `$${idx + 1}`).join(", ");
    const rows = (await db.select(
      `SELECT ${ownerColumn} AS owner_id, field_id, value
     FROM ${table} WHERE ${ownerColumn} IN (${placeholders})`,
      chunk
    )) as ValueRow[];

    for (const row of rows) {
      const current = byOwner.get(row.owner_id) ?? {};
      current[row.field_id] = row.value;
      byOwner.set(row.owner_id, current);
    }
  }
  return byOwner;
}

/**
 * Regrava os valores de um dono. Apagar tudo e reinserir é o que garante que
 * limpar um campo na UI realmente some do banco — um UPSERT deixaria a linha
 * antiga para trás e ela voltaria a compor a chave de agrupamento.
 */
export async function saveCustomValues(
  db: Queryable,
  table: ValueTable,
  ownerColumn: OwnerColumn,
  ownerId: UUID,
  values: CustomValues
): Promise<void> {
  await db.execute(`DELETE FROM ${table} WHERE ${ownerColumn} = $1`, [ownerId]);
  for (const [fieldId, value] of Object.entries(values)) {
    if (value === "") continue;
    await db.execute(`INSERT INTO ${table} (${ownerColumn}, field_id, value) VALUES ($1, $2, $3)`, [
      ownerId,
      fieldId,
      value,
    ]);
  }
}
