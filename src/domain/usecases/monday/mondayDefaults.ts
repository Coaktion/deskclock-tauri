import type { MondayFolder, MondayWorkspace } from "@shared/types/monday";

/**
 * Ids da conta em que a integração foi desenhada (Delivery Center). São
 * **sugestões de primeira escolha**, não configuração: só valem quando o id
 * aparece no que a API devolveu, e qualquer um deles é trocável pelos selects
 * da seção. Conta que não os tenha cai no comportamento anterior — primeiro
 * workspace, nenhuma pasta — sem nada travado.
 */
export const MONDAY_DEFAULT_WORKSPACE_ID = "15505674";
export const MONDAY_DEFAULT_CLIENTS_FOLDER_ID = "20715906";
export const MONDAY_DEFAULT_INTERNAL_FOLDER_ID = "20828788";

/**
 * Workspace inicial: o padrão quando ele existe, senão o primeiro da lista —
 * que é o que a conexão fazia antes de haver padrão.
 */
export function pickDefaultWorkspace(workspaces: MondayWorkspace[]): MondayWorkspace | null {
  return workspaces.find((w) => w.id === MONDAY_DEFAULT_WORKSPACE_ID) ?? workspaces[0] ?? null;
}

export interface MondayDefaultFolders {
  clientsFolderId: string;
  internalFolderId: string;
}

/**
 * Pastas iniciais. Id ausente vira string vazia, que é o valor neutro dos dois
 * campos ("Todas as pastas" e "Nenhuma") — nunca um id que a conta não tem.
 */
export function pickDefaultFolders(folders: MondayFolder[]): MondayDefaultFolders {
  const has = (id: string) => folders.some((f) => f.id === id);
  return {
    clientsFolderId: has(MONDAY_DEFAULT_CLIENTS_FOLDER_ID) ? MONDAY_DEFAULT_CLIENTS_FOLDER_ID : "",
    internalFolderId: has(MONDAY_DEFAULT_INTERNAL_FOLDER_ID)
      ? MONDAY_DEFAULT_INTERNAL_FOLDER_ID
      : "",
  };
}
