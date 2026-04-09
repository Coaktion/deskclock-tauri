import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ConfigRepository } from "@infra/database/ConfigRepository";

export interface OverlayPosition {
  x: number;
  y: number;
}

export interface AppConfig {
  // Geral
  userName: string;
  showWelcomeMessage: boolean;
  startOnBoot: boolean;
  liveTrayTimer: boolean;
  // Acessibilidade
  fontSize: "P" | "M" | "G" | "GG";
  theme: "azul" | "verde" | "escuro" | "claro";
  // Atalhos globais
  shortcutToggleTask: string;
  shortcutStopTask: string;
  shortcutToggleOverlay: string;
  shortcutToggleWindow: string;
  // Overlay
  overlayAlwaysVisible: boolean;
  overlayShowOnStart: boolean;
  overlayOpacity: number;
  overlaySnapToGrid: boolean;
  overlayShowGridIndicator: boolean;
  overlayPosition_execution: OverlayPosition;
  overlayPosition_planning: OverlayPosition;
  overlayPosition_compact: OverlayPosition;
}

const DEFAULTS: AppConfig = {
  userName: "",
  showWelcomeMessage: true,
  startOnBoot: false,
  liveTrayTimer: false,
  fontSize: "M" as const,
  theme: "azul" as const,
  shortcutToggleTask: "",
  shortcutStopTask: "",
  shortcutToggleOverlay: "",
  shortcutToggleWindow: "",
  overlayAlwaysVisible: true,
  overlayShowOnStart: true,
  overlayOpacity: 100,
  overlaySnapToGrid: false,
  overlayShowGridIndicator: false,
  overlayPosition_execution: { x: -1, y: -1 },
  overlayPosition_planning: { x: -1, y: -1 },
  overlayPosition_compact: { x: -1, y: -1 },
};

type ConfigKey = keyof AppConfig;

interface ConfigContextValue {
  isLoaded: boolean;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

const ConfigContext = createContext<ConfigContextValue | null>(null);

const repo = new ConfigRepository();

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const cache = useRef<AppConfig>({ ...DEFAULTS });

  useEffect(() => {
    async function load() {
      const keys = Object.keys(DEFAULTS) as ConfigKey[];
      await Promise.all(
        keys.map(async (key) => {
          const val = await repo.get(key, DEFAULTS[key]);
          (cache.current as unknown as Record<string, unknown>)[key] = val;
        }),
      );
      setIsLoaded(true);
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

  return (
    <ConfigContext.Provider value={{ isLoaded, get, set }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useAppConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useAppConfig must be inside ConfigProvider");
  return ctx;
}
