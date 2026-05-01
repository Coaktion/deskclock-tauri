import type { Task } from "@domain/entities/Task";

export interface TaskValidationResult {
  ok: boolean;
  /** Nomes de campos faltando, em pt-BR (ex: ["nome", "projeto"]). */
  missing: string[];
}

/**
 * Para enviar ao Google Sheets, a tarefa precisa ter nome, projeto e categoria.
 * Demais campos são derivados (start/end/duration/billable).
 */
export function validateTaskForSheets(task: Task): TaskValidationResult {
  const missing: string[] = [];
  if (!task.name?.trim()) missing.push("nome");
  if (!task.projectId) missing.push("projeto");
  if (!task.categoryId) missing.push("categoria");
  return { ok: missing.length === 0, missing };
}

/**
 * Para enviar ao Clockify, a tarefa precisa apenas de nome e projeto.
 * Tags e billable são opcionais.
 */
export function validateTaskForClockify(task: Task): TaskValidationResult {
  const missing: string[] = [];
  if (!task.name?.trim()) missing.push("nome");
  if (!task.projectId) missing.push("projeto");
  return { ok: missing.length === 0, missing };
}

export function formatMissingFields(missing: string[]): string {
  if (missing.length === 0) return "";
  if (missing.length === 1) return missing[0];
  if (missing.length === 2) return `${missing[0]} e ${missing[1]}`;
  return `${missing.slice(0, -1).join(", ")} e ${missing[missing.length - 1]}`;
}
