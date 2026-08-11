import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Task } from "@domain/entities/Task";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { AppConfig, ConfigContextValue } from "@shared/types/appConfig";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { AutoSyncProvider } from "@presentation/contexts/AutoSyncContext";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { usePostStopLogic } from "@presentation/hooks/usePostStopLogic";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

// Registro de ouvintes no lugar do barramento do Tauri: os `emit` do hook viram
// chamadas observáveis, como se outra janela estivesse escutando.
const handlers = new Map<string, Set<() => void>>();
const calls: string[] = [];

function fire(event: string) {
  handlers.get(event)?.forEach((cb) => cb());
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: () => void) => {
    const set = handlers.get(event) ?? new Set();
    set.add(cb);
    handlers.set(event, set);
    return Promise.resolve(() => set.delete(cb));
  },
  emit: (event: string) => {
    calls.push(`emit:${event}`);
    fire(event);
    return Promise.resolve();
  },
}));

// O toast abre uma janela do Tauri — fora do alcance do teste e irrelevante aqui.
vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(() => Promise.resolve()) }));

const NOW = "2026-08-11T10:00:00.000Z";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    workspaceId: DEFAULT_WORKSPACE_ID,
    name: null,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: NOW,
    endTime: "2026-08-11T11:00:00.000Z",
    durationSeconds: 3600,
    status: "completed",
    createdAt: NOW,
    updatedAt: NOW,
    customValues: {},
    ...overrides,
  };
}

const CONFIG_DEFAULTS: Partial<AppConfig> = {
  discardTasksUnderOneMinute: false,
  roundingEnabled: false,
  roundingSlots: [15, 30, 45, 60],
  roundingTolerance: 5,
};

function makeConfig(overrides: Partial<AppConfig> = {}): ConfigContextValue {
  const values = { ...CONFIG_DEFAULTS, ...overrides } as AppConfig;
  return {
    isLoaded: true,
    loadError: null,
    get: (key) => values[key],
    set: vi.fn(() => Promise.resolve()),
  };
}

function makeWrapper(taskRepo: ITaskRepository) {
  const plannedTaskRepo = {} as IPlannedTaskRepository;
  const configRepo: IConfigRepository = {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  };
  const autoSync = {
    runPerTask: vi.fn(async () => {
      calls.push("autoSync");
      return [];
    }),
    runDaily: vi.fn(async () => []),
    runDailyFor: vi.fn(async () => null),
    isSyncing: () => false,
  };

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ConfigProvider repository={configRepo}>
        <RepositoriesProvider value={{ taskRepo, plannedTaskRepo }}>
          <AutoSyncProvider value={autoSync}>{children}</AutoSyncProvider>
        </RepositoriesProvider>
      </ConfigProvider>
    );
  };
}

function renderStopRules(taskRepo: ITaskRepository, config: ConfigContextValue) {
  return renderHook(() => usePostStopLogic(config, vi.fn()), {
    wrapper: makeWrapper(taskRepo),
  });
}

describe("usePostStopLogic", () => {
  beforeEach(() => {
    handlers.clear();
    calls.length = 0;
    vi.clearAllMocks();
  });

  it("parar uma tarefa avulsa avisa as outras janelas", async () => {
    // Sem planejada de origem nenhum outro evento sai daqui: era o caso em que o
    // Lançamento manual aberto ficava sem sinal e não trazia o registro do dia.
    const taskRepo = {} as ITaskRepository;
    const { result } = renderStopRules(taskRepo, makeConfig());

    await act(async () => {
      await result.current.applyStopRules(task(), null, true);
    });

    expect(calls).toContain(`emit:${OVERLAY_EVENTS.TASKS_CHANGED}`);
  });

  it("parar como pendente também avisa", async () => {
    // Pendente não conclui planejada nem sincroniza, mas grava o mesmo registro
    // do dia — e as listas precisam dele.
    const taskRepo = {} as ITaskRepository;
    const { result } = renderStopRules(taskRepo, makeConfig());

    await act(async () => {
      await result.current.applyStopRules(task(), null, false);
    });

    expect(calls).toContain(`emit:${OVERLAY_EVENTS.TASKS_CHANGED}`);
  });

  it("avisa depois do arredondamento e antes do envio automático", async () => {
    // A ordem é o que faz quem recarregar ler a duração final, sem esperar rede.
    const stored = task({ durationSeconds: 3660 });
    const taskRepo = {
      findById: vi.fn(async () => stored),
      update: vi.fn(async () => {
        calls.push("update");
      }),
    } as unknown as ITaskRepository;
    const { result } = renderStopRules(taskRepo, makeConfig({ roundingEnabled: true }));

    await act(async () => {
      await result.current.applyStopRules(stored, null, true);
    });

    expect(calls).toEqual(["update", `emit:${OVERLAY_EVENTS.TASKS_CHANGED}`, "autoSync"]);
  });

  it("descartar a tarefa curta também avisa, porque o registro deixou de existir", async () => {
    // O `stopTask` já gravou a tarefa como concluída antes de chegar aqui: sem o
    // aviso, a linha fica na tela de uma tarefa que o descarte apagou.
    const taskRepo = {
      delete: vi.fn(async () => {}),
    } as unknown as ITaskRepository;
    const { result } = renderStopRules(taskRepo, makeConfig({ discardTasksUnderOneMinute: true }));

    let discarded: Task | null | undefined;
    await act(async () => {
      discarded = await result.current.applyStopRules(task({ durationSeconds: 30 }), null, true);
    });

    expect(discarded).toBeNull();
    expect(calls).toContain(`emit:${OVERLAY_EVENTS.TASKS_CHANGED}`);
  });
});
