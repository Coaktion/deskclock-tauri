import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ConfigRepository } from "@infra/database/ConfigRepository";
import { DEFAULT_COLUMN_MAPPING, type SheetColumnMapping } from "@shared/types/sheetsConfig";

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
  overlayOpacity: number;
  overlaySnapToGrid: boolean;
  overlayShowGridIndicator: boolean;
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
  // Tokens Google OAuth (armazenados localmente no SQLite)
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  googleUserEmail: string;
  // API REST local
  localApiEnabled: boolean;
  localApiPort: number;
  // Jornada
  dailyGoalHours: number;
  weeklyGoalHours: number;
  showWeekend: boolean;
  // Posicionamento de janelas
  windowPositioningAuto: boolean;
  workAreaWidth: number;
  workAreaHeight: number;
  taskbarPosition: "top" | "bottom" | "left" | "right";
  taskbarSize: number;
}

const DEFAULTS: AppConfig = {
  setupCompleted: false,
  userName: "",
  showWelcomeMessage: true,
  startOnBoot: false,
  liveTrayTimer: false,
  closeOnFocusLoss: false,
  discardTasksUnderOneMinute: false,
  fontSize: "M" as const,
  theme: "azul" as const,
  shortcutToggleTask: "",
  shortcutStopTask: "",
  shortcutToggleOverlay: "",
  shortcutToggleWindow: "",
  shortcutCommandPalette: "CmdOrCtrl+K",
  overlayAlwaysVisible: true,
  overlayShowOnStart: true,
  overlayOpacity: 100,
  overlaySnapToGrid: false,
  overlayShowGridIndicator: false,
  overlayPosition_execution: { x: -1, y: -1 },
  overlayPosition_planning: { x: -1, y: -1 },
  overlayPosition_compact: { x: -1, y: -1 },
  mainWindowPosition: { x: -1, y: -1 },
  integrationGoogleSheetsSpreadsheetId: "",
  integrationGoogleSheetsSheetName: "DeskClock",
  integrationGoogleSheetsColumnMapping: DEFAULT_COLUMN_MAPPING,
  integrationGoogleSheetsAutoSync: false,
  integrationGoogleSheetsDurationFormat: "HH:MM",
  sheetsAutoSyncMode: "per-task" as const,
  sheetsAutoSyncTrigger: "on-open" as const,
  sheetsAutoSyncTime: "18:00",
  sheetsDailySyncLastTimestamp: "",
  googleAccessToken: "",
  googleRefreshToken: "",
  googleTokenExpiry: 0,
  googleUserEmail: "",
  localApiEnabled: false,
  localApiPort: 27420,
  dailyGoalHours: 8,
  weeklyGoalHours: 40,
  showWeekend: true,
  windowPositioningAuto: true,
  workAreaWidth: 0,
  workAreaHeight: 0,
  taskbarPosition: "bottom" as const,
  taskbarSize: 40,
};

type ConfigKey = keyof AppConfig;

export interface ConfigContextValue {
  isLoaded: boolean;
  loadError: string | null;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

const repo = new ConfigRepository();

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cache = useRef<AppConfig>({ ...DEFAULTS });

  useEffect(() => {
    async function load() {
      try {
        const keys = Object.keys(DEFAULTS) as ConfigKey[];
        await Promise.all(
          keys.map(async (key) => {
            const val = await repo.get(key, DEFAULTS[key]);
            (cache.current as unknown as Record<string, unknown>)[key] = val;
          })
        );
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : String(e));
      } finally {
        setIsLoaded(true);
      }
    }
    load();
  }, []);

  function get<K extends ConfigKey>(key: K): AppConfig[K] {
    return cache.current[key];
  }

  async function set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void> {
    (cache.current as unknown as Record<string, unknown>)[key] = value;
    await repo.set(key, value);
  }

  return <ConfigContext.Provider value={{ isLoaded, loadError, get, set }}>{children}</ConfigContext.Provider>;
}

export function useAppConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useAppConfig must be inside ConfigProvider");
  return ctx;
}
