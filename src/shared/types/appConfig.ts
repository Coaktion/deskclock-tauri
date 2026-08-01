import type { SheetColumnMapping } from "@shared/types/sheetsConfig";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import type {
  ClockifyWorkspaceRef,
  ClockifyProjectMapping,
  ClockifyCategoryMapping,
} from "@shared/types/clockifyConfig";
import type { MondayWorkspaceRef, MondayProjectMapping } from "@shared/types/mondayConfig";
import type { MondayBoardRef, MondayFolder } from "@shared/types/monday";

export interface OverlayPosition {
  x: number;
  y: number;
}

export interface AppConfig {
  // Geral
  setupCompleted: boolean;
  userName: string;
  showWelcomeMessage: boolean;
  startOnBoot: boolean;
  liveTrayTimer: boolean;
  closeOnFocusLoss: boolean;
  discardTasksUnderOneMinute: boolean;
  showIntegrationsRail: boolean;
  // Acessibilidade
  fontSize: "P" | "M" | "G" | "GG";
  theme: "azul" | "verde" | "escuro" | "claro";
  // Atalhos globais
  shortcutToggleTask: string;
  shortcutStopTask: string;
  shortcutToggleOverlay: string;
  shortcutToggleWindow: string;
  // Atalho da janela
  shortcutCommandPalette: string;
  // Overlay
  overlayAlwaysVisible: boolean;
  overlayShowOnStart: boolean;
  overlaySize: "big" | "small";
  overlayOpacity: number;
  overlaySnapToGrid: boolean;
  overlayPosition_execution: OverlayPosition;
  overlayPosition_planning: OverlayPosition;
  overlayPosition_compact: OverlayPosition;
  mainWindowPosition: OverlayPosition;
  // Integrações
  integrationGoogleSheetsSpreadsheetId: string;
  integrationGoogleSheetsSheetName: string;
  integrationGoogleSheetsColumnMapping: SheetColumnMapping;
  integrationGoogleSheetsAutoSync: boolean;
  integrationGoogleSheetsDurationFormat: "HH:MM" | "HH:MM:SS";
  sheetsAutoSyncMode: "per-task" | "daily";
  sheetsAutoSyncTrigger: "fixed-time" | "on-open";
  sheetsAutoSyncTime: string;
  sheetsAutoSyncLastFiredDate: string;
  sheetsDailySyncLastTimestamp: string;
  // Google Agenda
  calendarAutoTrackingEnabled: boolean;
  // Tokens Google OAuth
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  googleUserEmail: string;
  // Tokens Zendesk OAuth
  zendeskSubdomain: string;
  zendeskClientId: string;
  zendeskClientSecret: string;
  zendeskAccessToken: string;
  zendeskRefreshToken: string;
  zendeskTokenExpiry: number;
  zendeskUserEmail: string;
  // API REST local
  localApiEnabled: boolean;
  localApiPort: number;
  // Jornada
  dailyGoalHours: number;
  weeklyGoalHours: number;
  // Arredondamento de duração
  roundingEnabled: boolean;
  roundingSlots: RoundingSlot[];
  roundingTolerance: number;
  // Clockify
  clockifyApiKey: string;
  clockifyUserEmail: string;
  clockifyUserId: string;
  clockifyActiveWorkspaceId: string;
  clockifyActiveWorkspaceName: string;
  clockifyDefaultTagIds: string[];
  clockifyProjectMapping: ClockifyProjectMapping[];
  clockifyCategoryMapping: ClockifyCategoryMapping[];
  clockifyAutoSync: boolean;
  clockifyAutoSyncMode: "per-task" | "daily";
  clockifyAutoSyncTrigger: "on-open" | "fixed-time";
  clockifyAutoSyncTime: string;
  clockifyAutoSyncLastFiredDate: string;
  clockifyDailySyncLastTimestamp: string;
  clockifyWorkspaceCache: ClockifyWorkspaceRef[];
  // Monday
  mondayApiKey: string;
  mondayUserId: string;
  mondayUserName: string;
  mondayUserEmail: string;
  mondayActiveWorkspaceId: string;
  mondayActiveWorkspaceName: string;
  /**
   * Catálogo do Monday cacheado: sem ele a tela de importação refazia três
   * chamadas à API a cada abertura. Recarregado só pelo botão de atualizar ou
   * quando o workspace do Monday muda.
   */
  mondayWorkspaceCache: MondayWorkspaceRef[];
  mondayFolderCache: MondayFolder[];
  mondayBoardCache: MondayBoardRef[];
  /** Pasta dos boards de cliente; vazio = sem filtro de pasta (fallback por nome). */
  mondayClientsFolderId: string;
  /** Pasta dos boards internos; vazio = nenhum board interno é importado. */
  mondayInternalFolderId: string;
  /**
   * Board interno **único** escolhido pelo usuário. Vira um Project como
   * qualquer outro — a granularidade interna vem da categoria. Escolher outro
   * substitui o anterior.
   */
  mondayInternalBoardId: string;
  /**
   * Campo personalizado que alimenta a coluna "Project Stage" da atividade.
   * Vazio = a coluna não é preenchida.
   */
  mondayProjectStageFieldId: string;
  mondayProjectMapping: MondayProjectMapping[];
  mondayAutoSync: boolean;
  mondayAutoSyncMode: "per-task" | "daily";
  mondayAutoSyncTrigger: "on-open" | "fixed-time";
  mondayAutoSyncTime: string;
  mondayAutoSyncLastFiredDate: string;
  mondayDailySyncLastTimestamp: string;
  // Workspaces
  /** Workspace ativo na UI. Vazio = cai no workspace "Padrão" da migration 011. */
  activeWorkspaceId: string;
  // Tours
  toursSeen: string[];
}

export type ConfigKey = keyof AppConfig;

export interface ConfigContextValue {
  isLoaded: boolean;
  loadError: string | null;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}
