import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { emit } from "@tauri-apps/api/event";
import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { useTaskUndo } from "@presentation/hooks/useTaskUndo";
import { UNDO_WINDOW_MS } from "@presentation/hooks/useUndoableDelete";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { showToast } from "@shared/utils/toast";
import { localISO } from "../../helpers/localTime";

// Registro de ouvintes no lugar do barramento do Tauri: `fire` faz o papel do
// botão do toast, que emite de outra janela.
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
  emit: vi.fn(() => Promise.resolve()),
}));

vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(() => Promise.resolve()) }));

function makeTask(id: string): Task {
  return {
    id,
    workspaceId: "ws-1",
    name: `Lançamento ${id}`,
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 4, 8, 9),
    endTime: localISO(2026, 4, 8, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 4, 8, 9),
    updatedAt: localISO(2026, 4, 8, 10),
    plannedTaskId: null,
    customValues: { f1: "opt-1" },
  };
}

/** Repositório em memória: o que interessa é o que está no banco depois. */
function makeRepo(ids: string[]) {
  const store = new Map(ids.map((id) => [id, makeTask(id)]));
  const repo = {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    delete: vi.fn(async (id: string) => void store.delete(id)),
    save: vi.fn(async (task: Task) => void store.set(task.id, task)),
  } as unknown as ITaskRepository;
  return { repo, store };
}

function setup(ids: string[]) {
  const { repo, store } = makeRepo(ids);
  const reload = vi.fn(async () => {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoriesProvider value={{ taskRepo: repo }}>{children}</RepositoriesProvider>
  );
  const { result } = renderHook(() => useTaskUndo(reload), { wrapper });
  return { result, repo, store, reload };
}

function tasksChangedCalls() {
  return vi.mocked(emit).mock.calls.filter(([event]) => event === OVERLAY_EVENTS.TASKS_CHANGED);
}

async function flush() {
  await act(async () => {});
}

// O comportamento do desfazer é do `useUndoableDelete` e está testado lá. Aqui
// fica a configuração: texto, evento, repositório e o aviso às outras janelas.
describe("useTaskUndo", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("um lançamento: toast singular com o evento de lançamentos", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    expect(store.has("a")).toBe(false);
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Lançamento excluído",
      UNDO_WINDOW_MS,
      "Desfazer",
      OVERLAY_EVENTS.TASKS_UNDO_DELETE
    );
  });

  it("lote: toast no plural", async () => {
    const { result } = setup(["a", "b"]);
    await act(() => result.current.removeWithUndo(["a", "b"]));
    expect(vi.mocked(showToast).mock.calls[0][1]).toBe("2 lançamentos excluídos");
  });

  it("apagar avisa as outras janelas e recarrega a tela", async () => {
    const { result, reload } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    expect(tasksChangedCalls()).toHaveLength(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("desfazer devolve o snapshot inteiro, avisa as outras janelas e recarrega", async () => {
    const { result, store, reload } = setup(["a"]);
    const before = store.get("a");
    await act(() => result.current.removeWithUndo(["a"]));
    fire(OVERLAY_EVENTS.TASKS_UNDO_DELETE);
    await flush();
    expect(store.get("a")).toEqual(before);
    expect(tasksChangedCalls()).toHaveLength(2);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("não ouve o evento de desfazer das planejadas", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    await flush();
    expect(store.has("a")).toBe(false);
  });
});
