import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useAppConfig } from "./ConfigContext";
import { useRepositories } from "./RepositoriesContext";
import { AutoSyncRunner } from "@infra/integrations/AutoSyncRunner";
import {
  SheetsSyncStrategy,
  SHEETS_INTEGRATION_NAME,
} from "@infra/integrations/SheetsSyncStrategy";
import { ClockifySyncStrategy } from "@infra/integrations/ClockifySyncStrategy";
import {
  MondaySyncStrategy,
  MONDAY_INTEGRATION_NAME,
} from "@infra/integrations/MondaySyncStrategy";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { Task } from "@domain/entities/Task";

export interface AutoSyncApi {
  runPerTask(task: Task): Promise<AutoSyncResult[]>;
  runDaily(endDateISO: string): Promise<AutoSyncResult[]>;
  /** Envio diário de uma integração só — o "Sincronizar agora" de cada card. */
  runDailyFor(integrationName: string, endDateISO: string): Promise<AutoSyncResult | null>;
  isSyncing(integrationName?: string): boolean;
}

const AutoSyncContext = createContext<AutoSyncApi | null>(null);

export { SHEETS_INTEGRATION_NAME, MONDAY_INTEGRATION_NAME };

export function AutoSyncProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: AutoSyncApi;
}) {
  const config = useAppConfig();
  const {
    taskRepo,
    projectRepo,
    categoryRepo,
    taskLogRepo,
    mondayActivityItemRepo,
    customFieldRepo,
  } = useRepositories();

  const runner = useMemo(() => {
    const strategies: ISyncStrategy[] = [
      new SheetsSyncStrategy(config, taskRepo, projectRepo, categoryRepo, taskLogRepo),
      new ClockifySyncStrategy(config, taskRepo, taskLogRepo),
      new MondaySyncStrategy(
        config,
        taskRepo,
        taskLogRepo,
        mondayActivityItemRepo,
        customFieldRepo,
        categoryRepo
      ),
    ];
    return new AutoSyncRunner(strategies);
  }, [
    config,
    taskRepo,
    projectRepo,
    categoryRepo,
    taskLogRepo,
    mondayActivityItemRepo,
    customFieldRepo,
  ]);

  const subscribe = useCallback((cb: () => void) => runner.subscribe(cb), [runner]);
  const getSnapshot = useCallback(() => runner.getVersion(), [runner]);
  const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const defaults = useMemo<AutoSyncApi>(
    () => ({
      runPerTask: (t) => runner.runPerTask(t),
      runDaily: (d) => runner.runDaily(d),
      runDailyFor: (name, d) => runner.runDailyFor(name, d),
      isSyncing: (name?: string) => {
        void version;
        return runner.isSyncing(name);
      },
    }),
    [runner, version]
  );

  const api = useMemo(() => value ?? defaults, [defaults, value]);
  return <AutoSyncContext.Provider value={api}>{children}</AutoSyncContext.Provider>;
}

export function useAutoSync(): AutoSyncApi {
  const ctx = useContext(AutoSyncContext);
  if (!ctx) throw new Error("useAutoSync must be used within an AutoSyncProvider");
  return ctx;
}
