import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider, useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { usePlannedTaskActions } from "@presentation/hooks/usePlannedTaskActions";
import { usePlannedTasksForWorkspace } from "@presentation/hooks/usePlannedTasks";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

// Registro de ouvintes no lugar do barramento do Tauri: `fire` faz o papel de
// outra janela emitindo o evento.
const handlers = new Map<string, Set<() => void>>();

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
    fire(event);
    return Promise.resolve();
  },
}));

const URL_ACTION: PlannedTaskAction = { type: "open_url", value: "https://exemplo.com" };
const FILE_ACTION: PlannedTaskAction = { type: "open_file", value: "/tmp/relatorio.pdf" };

function makePlanned(id: string, actions: PlannedTaskAction[]): PlannedTask {
  return {
    id,
    workspaceId: "ws-1",
    name: `Planejada ${id}`,
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: "2026-04-08",
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions,
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function makeWrapper(plannedTaskRepo: IPlannedTaskRepository) {
  const configRepo: IConfigRepository = {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  };
  // Sem o "Padrão" na lista, o provider cai no primeiro — é o que torna o
  // workspace ativo distinguível do default no teste do `findAll`.
  const workspaceRepo = {
    findAll: vi.fn(async () => [
      { id: "ws-ativo", name: "Cliente", color: "teal", createdAt: "2026-01-01T00:00:00Z" },
    ]),
  } as unknown as IWorkspaceRepository;

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ConfigProvider repository={configRepo}>
        <RepositoriesProvider value={{ plannedTaskRepo, workspaceRepo }}>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </RepositoriesProvider>
      </ConfigProvider>
    );
  };
}

describe("usePlannedTaskActions", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("sem id devolve vazio e não consulta o repositório", async () => {
    const repo = { findById: vi.fn() } as unknown as IPlannedTaskRepository;
    const { result } = renderHook(
      () => ({ actions: usePlannedTaskActions(null), workspaces: useWorkspaces() }),
      { wrapper: makeWrapper(repo) }
    );
    // Espera os providers assentarem, para a asserção valer depois do carregamento.
    await waitFor(() => expect(result.current.workspaces.loading).toBe(false));
    expect(result.current.actions).toEqual([]);
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it("carrega as ações da planejada", async () => {
    const repo = {
      findById: vi.fn(async () => makePlanned("pt-1", [URL_ACTION])),
    } as unknown as IPlannedTaskRepository;
    const { result } = renderHook(() => usePlannedTaskActions("pt-1"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current).toEqual([URL_ACTION]));
    expect(repo.findById).toHaveBeenCalledWith("pt-1");
  });

  it("planejada inexistente ou consulta com erro devolvem vazio", async () => {
    const repo = {
      findById: vi.fn(async (id: string) => {
        if (id === "falha") throw new Error("banco indisponível");
        return null;
      }),
    } as unknown as IPlannedTaskRepository;
    const { result, rerender } = renderHook(({ id }) => usePlannedTaskActions(id), {
      wrapper: makeWrapper(repo),
      initialProps: { id: "excluida" },
    });
    await waitFor(() => expect(repo.findById).toHaveBeenCalledWith("excluida"));
    expect(result.current).toEqual([]);

    rerender({ id: "falha" });
    await waitFor(() => expect(repo.findById).toHaveBeenCalledWith("falha"));
    expect(result.current).toEqual([]);
  });

  it("resposta atrasada de um id antigo é descartada", async () => {
    // A consulta do primeiro id só termina depois da do segundo: sem o descarte,
    // a linha mostraria as ações de outra planejada.
    const slow = deferred<PlannedTask | null>();
    const repo = {
      findById: vi.fn((id: string) =>
        id === "pt-lento" ? slow.promise : Promise.resolve(makePlanned("pt-novo", [FILE_ACTION]))
      ),
    } as unknown as IPlannedTaskRepository;
    const { result, rerender } = renderHook(({ id }) => usePlannedTaskActions(id), {
      wrapper: makeWrapper(repo),
      initialProps: { id: "pt-lento" },
    });

    rerender({ id: "pt-novo" });
    await waitFor(() => expect(result.current).toEqual([FILE_ACTION]));

    await act(async () => {
      slow.resolve(makePlanned("pt-lento", [URL_ACTION]));
      await slow.promise;
    });
    expect(result.current).toEqual([FILE_ACTION]);
  });

  it("relê quando outra janela avisa que as planejadas mudaram", async () => {
    let stored = makePlanned("pt-1", [URL_ACTION]);
    const repo = {
      findById: vi.fn(async () => stored),
    } as unknown as IPlannedTaskRepository;
    const { result } = renderHook(() => usePlannedTaskActions("pt-1"), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(result.current).toEqual([URL_ACTION]));

    stored = makePlanned("pt-1", [URL_ACTION, FILE_ACTION]);
    act(() => fire(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED));

    await waitFor(() => expect(result.current).toEqual([URL_ACTION, FILE_ACTION]));
  });
});

describe("usePlannedTasksForWorkspace", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("carrega todas as planejadas do workspace ativo", async () => {
    const planned = [makePlanned("pt-1", [])];
    const repo = {
      findAll: vi.fn(async () => planned),
    } as unknown as IPlannedTaskRepository;
    const { result } = renderHook(() => usePlannedTasksForWorkspace(), {
      wrapper: makeWrapper(repo),
    });
    await waitFor(() => expect(repo.findAll).toHaveBeenCalledWith("ws-ativo"));
    await waitFor(() => expect(result.current.tasks).toEqual(planned));
  });
});
