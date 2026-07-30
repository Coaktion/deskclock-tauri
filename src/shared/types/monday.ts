/** DTOs da API GraphQL do Monday.com (https://api.monday.com/v2). */

export interface MondayUser {
  id: string;
  name: string;
  email: string;
}

export interface MondayWorkspace {
  id: string;
  name: string;
}

export interface MondayFolder {
  id: string;
  name: string;
}

export interface MondayBoardRef {
  id: string;
  name: string;
  /** `board_folder_id` — null para boards fora de pasta (ex: "Subitems of …"). */
  folderId: string | null;
  state: string;
}

export interface MondayColumn {
  id: string;
  title: string;
  /** Tipo do Monday: "numbers", "status", "people", "text"… */
  type: string;
  /** JSON cru com labels de colunas `status`/`color`. */
  settingsStr?: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayView {
  id: string;
  name: string;
  type: string;
  /** JSON cru com as regras da view (inclui o grupo filtrado). */
  settingsStr?: string;
}

export interface MondayBoardSchema {
  id: string;
  name: string;
  groups: MondayGroup[];
  columns: MondayColumn[];
  views: MondayView[];
}

export interface MondayItemRef {
  id: string;
}
