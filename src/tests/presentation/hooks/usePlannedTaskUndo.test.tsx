import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { usePlannedTaskUndo } from "@presentation/hooks/usePlannedTaskUndo";
import { UNDO_WINDOW_MS } from "@presentation/hooks/useUndoableDelete";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { showToast } from "@shared/utils/toast";

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

function makePlanned(id: string): PlannedTask {
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
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
  };
}

/** Repositório em memória: o que interessa é o que está no banco depois. */
function makeRepo(ids: string[]) {
  const store = new Map(ids.map((id) => [id, makePlanned(id)]));
  const repo = {
    findById: vi.fn(async (id: string) => store.get(id) ?? null),
    delete: vi.fn(async (id: string) => void store.delete(id)),
    save: vi.fn(async (task: PlannedTask) => void store.set(task.id, task)),
  } as unknown as IPlannedTaskRepository;
  return { repo, store };
}

function setup(ids: string[]) {
  const { repo, store } = makeRepo(ids);
  const onChanged = vi.fn(async () => {});
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RepositoriesProvider value={{ plannedTaskRepo: repo }}>{children}</RepositoriesProvider>
  );
  const { result } = renderHook(() => usePlannedTaskUndo(onChanged), { wrapper });
  return { result, repo, store, onChanged };
}

async function flush() {
  await act(async () => {});
}

// O comportamento do desfazer (Ctrl+Z, janela de 6 s, idempotência, erros,
// duas instâncias) é do `useUndoableDelete` e está testado lá. Aqui fica só a
// configuração: texto, evento e o repositório de planejadas.
describe("usePlannedTaskUndo", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("uma tarefa: toast singular com a ação de desfazer, e recarrega", async () => {
    const { result, store, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    expect(store.has("a")).toBe(false);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Tarefa excluída",
      UNDO_WINDOW_MS,
      "Desfazer",
      OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE
    );
  });

  it("lote: um toast só, no plural", async () => {
    const { result } = setup(["a", "b", "c"]);
    await act(() => result.current.removeWithUndo(["a", "b", "c"]));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][1]).toBe("3 tarefas excluídas");
  });

  it("o evento do botão do toast restaura e recarrega", async () => {
    const { result, store, onChanged } = setup(["a", "b"]);
    await act(() => result.current.removeWithUndo(["a", "b"]));
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    await flush();
    expect([...store.keys()].sort()).toEqual(["a", "b"]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });
});
