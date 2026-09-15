import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { DomainError } from "@shared/errors";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { ConflictError, NotFoundError } from "./errors";
import { billableForCategoryChange, resolveCatalogPatch, type CatalogRefs } from "./resolve";
import type { LocalApiDeps, LocalApiParams } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertDate(value: string, field: string) {
  if (!DATE_PATTERN.test(value)) {
    throw new DomainError(`${field} deve estar no formato YYYY-MM-DD`);
  }
}

/**
 * Período em dias locais convertido nos limites do dia (§6.6), como o Histórico
 * faz. Sem `from`, é hoje; sem `to`, o mesmo dia de `from`.
 */
export function periodRange(deps: LocalApiDeps, params: LocalApiParams) {
  const from = params.from || deps.todayISO();
  const to = params.to || from;
  assertDate(from, "from");
  assertDate(to, "to");
  if (from > to) throw new DomainError("from não pode ser posterior a to");
  return { from, to, startISO: startOfDayISO(from), endISO: endOfDayISO(to) };
}

/** Instante ISO com hora; normalizado em UTC, como o app grava. */
export function parseInstant(value: string | null | undefined, field: string): string {
  const time = Date.parse(value ?? "");
  if (!value?.includes("T") || Number.isNaN(time)) {
    throw new DomainError(
      `${field} deve ser um instante ISO 8601 (ex.: 2026-09-15T09:00:00-03:00)`
    );
  }
  return new Date(time).toISOString();
}

export function secondsBetween(startISO: string, endISO: string): number {
  return Math.round((Date.parse(endISO) - Date.parse(startISO)) / 1000);
}

export async function findTaskOrThrow(deps: LocalApiDeps, id: string | undefined): Promise<Task> {
  const task = id ? await deps.taskRepo.findById(id) : null;
  if (!task) throw new NotFoundError(`Tarefa '${id}' não encontrada`);
  return task;
}

// O timer tem regras próprias (pausa, arredondamento, planejada de origem) que
// só o contexto aplica; gravar pelo repositório as pularia por baixo da tela.
export function assertNotActive(task: Task) {
  if (task.status !== "completed") {
    throw new ConflictError(
      `A tarefa '${task.id}' está em execução ou pausada. Use PATCH /tasks/active para editá-la ou POST /tasks/cancel para descartá-la.`
    );
  }
}

export interface TaskEditBody extends CatalogRefs {
  name?: string | null;
  billable?: boolean | null;
  customValues?: CustomValues | null;
}

/**
 * O que a edição parcial de uma tarefa (concluída ou ativa) grava, fora o
 * horário: só o que veio no corpo, `null` limpa, e trocar a categoria sem
 * `billable` aplica o padrão dela (§6.2).
 */
export async function buildTaskEditPatch(deps: LocalApiDeps, task: Task, body: TaskEditBody) {
  const catalog = await resolveCatalogPatch(deps, task.workspaceId, body);
  return {
    ...(body.name !== undefined && { name: body.name?.trim() || null }),
    ...catalog,
    ...(await billableForCategoryChange(deps, task.workspaceId, body, catalog, task.categoryId)),
    ...(body.customValues !== undefined && { customValues: body.customValues ?? {} }),
  };
}
