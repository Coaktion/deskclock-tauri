import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppConfig } from "./ConfigContext";
import { useRepositories } from "./RepositoriesContext";
import { AutoSyncRunner } from "@infra/integrations/AutoSyncRunner";
import { SheetsSyncStrategy } from "@infra/integrations/SheetsSyncStrategy";
import { ClockifySyncStrategy } from "@infra/integrations/ClockifySyncStrategy";
import type { ISyncStrategy, AutoSyncResult } from "@domain/integrations/ISyncStrategy";
import type { Task } from "@domain/entities/Task";

export interface AutoSyncApi {
  runPerTask(task: Task): Promise<AutoSyncResult[]>;
  runDaily(endDateISO: string): Promise<AutoSyncResult[]>;
}

const AutoSyncContext = createContext<AutoSyncApi | null>(null);

export function AutoSyncProvider({
  children,
  value,
}: { children: ReactNode; value?: AutoSyncApi }) {
  const config = useAppConfig();
  const { taskRepo, projectRepo, categoryRepo, taskLogRepo } = useRepositories();

  const defaults = useMemo<AutoSyncApi>(() => {
    const strategies: ISyncStrategy[] = [
      new SheetsSyncStrategy(config, taskRepo, projectRepo, categoryRepo, taskLogRepo),
      new ClockifySyncStrategy(config, taskRepo, taskLogRepo),
    ];
    const runner = new AutoSyncRunner(strategies);
    return {
      runPerTask: (t) => runner.runPerTask(t),
      runDaily: (d) => runner.runDaily(d),
    };
  }, [config, taskRepo, projectRepo, categoryRepo, taskLogRepo]);

  const api = useMemo(() => value ?? defaults, [defaults, value]);
  return <AutoSyncContext.Provider value={api}>{children}</AutoSyncContext.Provider>;
}

export function useAutoSync(): AutoSyncApi {
  const ctx = useContext(AutoSyncContext);
  if (!ctx) throw new Error("useAutoSync must be used within an AutoSyncProvider");
  return ctx;
}
