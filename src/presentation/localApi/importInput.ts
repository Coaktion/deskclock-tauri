import { DomainError } from "@shared/errors";
import { ConflictError, NotFoundError } from "./errors";
import { has, resolveCategoryId, resolveProjectId } from "./resolve";
import type { LocalApiDeps } from "./types";

// Leitura do corpo dos imports (`docs-internal/specs/mcp.md` §7, Fase D1): o que
// os três têm em comum — a lista de escolhidos, as chaves booleanas e o
// projeto/categoria que sobrescrevem a sugestão.

export type ImportBody = Record<string, unknown>;

export function importBody(body: unknown): ImportBody {
  if (body === null || body === undefined) return {};
  if (typeof body !== "object" || Array.isArray(body)) {
    throw new DomainError("Corpo deve ser um objeto JSON");
  }
  return body as ImportBody;
}

export { has };

/** Booleano opcional: ausente ou `null` = o padrão da tela. */
export function optionalBoolean(body: ImportBody, key: string, fallback: boolean): boolean {
  const value = body[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new DomainError(`${key} deve ser true ou false`);
  return value;
}

export function optionalString(item: ImportBody, key: string): string | null | undefined {
  const value = item[key];
  if (value === undefined || value === null) return value;
  if (typeof value !== "string") throw new DomainError(`${key} deve ser texto`);
  return value;
}

/**
 * A lista de escolhidos: objetos com `id` do tipo pedido, sem repetição (o
 * primeiro vence) e nunca vazia — o botão da tela fica desabilitado sem seleção.
 */
export function selectionList<Id extends string | number>(
  body: ImportBody,
  key: string,
  idType: "string" | "number"
): { id: Id; item: ImportBody }[] {
  const list = body[key];
  if (!Array.isArray(list)) throw new DomainError(`${key} deve ser uma lista`);
  const seen = new Set<Id>();
  const result: { id: Id; item: ImportBody }[] = [];
  for (const raw of list) {
    const item = raw as ImportBody | null;
    if (!item || typeof item !== "object" || typeof item.id !== idType) {
      throw new DomainError(`Cada item de ${key} deve ser um objeto com 'id' (${idType})`);
    }
    const id = item.id as Id;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, item });
  }
  if (result.length === 0) throw new DomainError("Selecione ao menos um item.");
  return result;
}

/** Ids escolhidos que não estão na lista que a prévia mostraria → 404. */
export function assertAllFound(
  wanted: (string | number)[],
  known: Set<string | number>,
  what: string
) {
  const missing = wanted.filter((id) => !known.has(id));
  if (missing.length > 0) throw new NotFoundError(`${what}: ${missing.join(", ")}`);
}

/** Integração não conectada → 409 com a frase da fonte. */
export function assertConfigured(source: { notConfiguredMessage: string | null }) {
  if (source.notConfiguredMessage) throw new ConflictError(source.notConfiguredMessage);
}

/**
 * Projeto da linha: ausente fica a sugestão; `projectId`/`projectName` (ou
 * `null`, que limpa) sobrescrevem, resolvidos no workspace do import.
 */
export async function overrideProject(
  deps: LocalApiDeps,
  workspaceId: string,
  item: ImportBody
): Promise<{ changed: boolean; projectId: string | null }> {
  if (!has(item, "projectId") && !has(item, "projectName")) {
    return { changed: false, projectId: null };
  }
  const projectId = await resolveProjectId(
    deps,
    workspaceId,
    optionalString(item, "projectId"),
    optionalString(item, "projectName")
  );
  return { changed: true, projectId };
}

export async function overrideCategory(
  deps: LocalApiDeps,
  workspaceId: string,
  item: ImportBody
): Promise<{ changed: boolean; categoryId: string | null }> {
  if (!has(item, "categoryId") && !has(item, "categoryName")) {
    return { changed: false, categoryId: null };
  }
  const categoryId = await resolveCategoryId(
    deps,
    workspaceId,
    optionalString(item, "categoryId"),
    optionalString(item, "categoryName")
  );
  return { changed: true, categoryId };
}
