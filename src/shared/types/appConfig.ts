import type { SheetColumnMapping } from "@shared/types/sheetsConfig";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import type {
  ClockifyWorkspaceRef,
  ClockifyProjectMapping,
  ClockifyCategoryMapping,
} from "@shared/types/clockifyConfig";

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
  sheetsDailySyncLastTimestamp: string;
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
  showWeekend: boolean;
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
  clockifyDailySyncLastTimestamp: string;
  clockifyWorkspaceCache: ClockifyWorkspaceRef[];
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
