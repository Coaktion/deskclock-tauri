import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { AutoSyncApi } from "@presentation/contexts/AutoSyncContext";
import { AutoSyncProvider, useAutoSync } from "@presentation/contexts/AutoSyncContext";

vi.mock("@infra/integrations/SheetsSyncStrategy", () => ({
  SheetsSyncStrategy: vi.fn(() => ({
    integrationName: "Google Sheets",
    isPerTaskEnabled: () => false,
    isDailyEnabled: () => false,
    runPerTask: vi.fn(),
    runDaily: vi.fn(),
  })),
}));
vi.mock("@infra/integrations/ClockifySyncStrategy", () => ({
  ClockifySyncStrategy: vi.fn(() => ({
    integrationName: "Clockify",
    isPerTaskEnabled: () => false,
    isDailyEnabled: () => false,
    runPerTask: vi.fn(),
    runDaily: vi.fn(),
  })),
}));
vi.mock("@presentation/contexts/ConfigContext", () => ({
  useAppConfig: () => ({
    isLoaded: true,
    get: vi.fn(() => ""),
    set: vi.fn(),
  }),
}));
vi.mock("@presentation/contexts/RepositoriesContext", () => ({
  useRepositories: () => ({
    taskRepo: {},
    projectRepo: {},
    categoryRepo: {},
    taskLogRepo: {},
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <AutoSyncProvider>{children}</AutoSyncProvider>;
}

describe("AutoSyncContext", () => {
  it("lança erro quando usado fora do provider", () => {
    expect(() => renderHook(() => useAutoSync())).toThrow(
      "useAutoSync must be used within an AutoSyncProvider"
    );
  });

  it("retorna api injetada quando value é fornecido", () => {
    const mockApi: AutoSyncApi = {
      runPerTask: vi.fn().mockResolvedValue([]),
      runDaily: vi.fn().mockResolvedValue([]),
      runDailyFor: vi.fn().mockResolvedValue(null),
      isDailyEnabled: vi.fn().mockReturnValue(false),
      isSyncing: vi.fn().mockReturnValue(false),
    };
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <AutoSyncProvider value={mockApi}>{children}</AutoSyncProvider>
    );
    const { result } = renderHook(() => useAutoSync(), { wrapper: customWrapper });

    expect(result.current).toBe(mockApi);
  });

  it("expõe isSyncing como false por padrão", () => {
    const { result } = renderHook(() => useAutoSync(), { wrapper });
    expect(result.current.isSyncing()).toBe(false);
    expect(result.current.isSyncing("Google Sheets")).toBe(false);
  });
});
