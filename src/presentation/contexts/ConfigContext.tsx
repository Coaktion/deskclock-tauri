import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ConfigRepository } from "@infra/database/ConfigRepository";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { DEFAULT_COLUMN_MAPPING } from "@shared/types/sheetsConfig";
import type {
  AppConfig,
  ConfigContextValue,
  ConfigKey,
  OverlayPosition,
} from "@shared/types/appConfig";

export type { AppConfig, ConfigContextValue, ConfigKey, OverlayPosition };

const DEFAULTS: AppConfig = {
  setupCompleted: false,
  userName: "",
  showWelcomeMessage: true,
  startOnBoot: false,
  liveTrayTimer: false,
  closeOnFocusLoss: false,
  discardTasksUnderOneMinute: false,
  showIntegrationsRail: true,
  fontSize: "M" as const,
  theme: "azul" as const,
  shortcutToggleTask: "",
  shortcutStopTask: "",
  shortcutToggleOverlay: "",
  shortcutToggleWindow: "",
  shortcutCommandPalette: "",
  overlayAlwaysVisible: true,
  overlayShowOnStart: true,
  overlaySize: "big" as const,
  overlayOpacity: 100,
  overlaySnapToGrid: false,
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
  sheetsAutoSyncLastFiredDate: "",
  sheetsDailySyncLastTimestamp: "",
  calendarAutoTrackingEnabled: false,
  googleAccessToken: "",
  googleRefreshToken: "",
  googleTokenExpiry: 0,
  googleUserEmail: "",
  zendeskSubdomain: "",
  zendeskClientId: "",
  zendeskClientSecret: "",
  zendeskAccessToken: "",
  zendeskRefreshToken: "",
  zendeskTokenExpiry: 0,
  zendeskUserEmail: "",
  localApiEnabled: false,
  localApiPort: 27420,
  dailyGoalHours: 8,
  weeklyGoalHours: 40,
  showWeekend: true,
  roundingEnabled: false,
  roundingSlots: [15, 30, 45, 60],
  roundingTolerance: 0,
  clockifyApiKey: "",
  clockifyUserEmail: "",
  clockifyUserId: "",
  clockifyActiveWorkspaceId: "",
  clockifyActiveWorkspaceName: "",
  clockifyDefaultTagIds: [],
  clockifyProjectMapping: [],
  clockifyCategoryMapping: [],
  clockifyAutoSync: false,
  clockifyAutoSyncMode: "per-task" as const,
  clockifyAutoSyncTrigger: "on-open" as const,
  clockifyAutoSyncTime: "18:00",
  clockifyAutoSyncLastFiredDate: "",
  clockifyDailySyncLastTimestamp: "",
  clockifyWorkspaceCache: [],
  mondayApiKey: "",
  mondayUserId: "",
  mondayUserName: "",
  mondayUserEmail: "",
  mondayActiveWorkspaceId: "",
  mondayActiveWorkspaceName: "",
  mondayWorkspaceCache: [],
  mondayProjectsFolderId: "",
  mondayProjectMapping: [],
  mondayCategoryMapping: [],
  mondayAutoSync: false,
  mondayAutoSyncMode: "per-task" as const,
  mondayAutoSyncTrigger: "on-open" as const,
  mondayAutoSyncTime: "18:00",
  mondayAutoSyncLastFiredDate: "",
  mondayDailySyncLastTimestamp: "",
  activeWorkspaceId: "",
  toursSeen: [],
};

const ConfigContext = createContext<ConfigContextValue | null>(null);

export function ConfigProvider({
  children,
  repository,
}: {
  children: React.ReactNode;
  repository?: IConfigRepository;
}) {
  const repoRef = useRef<IConfigRepository | undefined>(undefined);
  if (!repoRef.current) repoRef.current = repository ?? new ConfigRepository();

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cache = useRef<AppConfig>({ ...DEFAULTS });

  useEffect(() => {
    async function load() {
      try {
        const loaded = await repoRef.current!.loadAll();
        const keys = Object.keys(DEFAULTS) as ConfigKey[];
        for (const key of keys) {
          (cache.current as unknown as Record<string, unknown>)[key] =
            key in loaded ? loaded[key] : DEFAULTS[key];
        }
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
    await repoRef.current!.set(key, value);
  }

  return (
    <ConfigContext.Provider value={{ isLoaded, loadError, get, set }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useAppConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useAppConfig must be inside ConfigProvider");
  return ctx;
}
