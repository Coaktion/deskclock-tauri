import type { MondayBoardRef } from "@shared/types/monday";
import { filterProjectBoards } from "./filterProjectBoards";

/**
 * As duas pastas que alimentam o import, mais o board interno vinculado.
 *
 * Os campos são opcionais porque o `folders()` do Monday pode vir vazio conforme
 * o token — sem pasta, o reconhecimento cai nos filtros de nome e estado.
 */
export interface MondayBoardSelection {
  /** Pasta dos boards de cliente; vazio = sem filtro de pasta. */
  clientsFolderId?: string;
  /** Pasta dos boards internos; vazio = nenhum board interno entra. */
  internalFolderId?: string;
  /** O **único** board interno vinculado; escolher outro substitui o anterior. */
  internalBoardId?: string;
}

/**
 * Enumera os boards que viram Project no DeskClock: todos os da pasta de
 * clientes, mais **um** board da pasta interna.
 *
 * A pasta interna é excluída explicitamente da varredura de clientes: sem pasta
 * de clientes escolhida não há filtro de pasta nenhum, e todos os boards
 * internos entrariam como se fossem projetos de cliente — o oposto da regra de
 * "um board interno só" (ver `docs/specs/workspaces-custom-fields.md`).
 */
export function selectImportBoards(
  boards: MondayBoardRef[],
  { clientsFolderId, internalFolderId, internalBoardId }: MondayBoardSelection
): MondayBoardRef[] {
  const eligible = filterProjectBoards(boards, clientsFolderId || undefined);
  const clients = internalFolderId
    ? eligible.filter((board) => board.folderId !== internalFolderId)
    : eligible;

  const internal = internalBoardId
    ? filterProjectBoards(boards).find((board) => board.id === internalBoardId)
    : undefined;

  if (!internal || clients.some((board) => board.id === internal.id)) return clients;
  return [...clients, internal];
}
