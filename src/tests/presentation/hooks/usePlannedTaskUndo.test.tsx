import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { UNDO_WINDOW_MS, usePlannedTaskUndo } from "@presentation/hooks/usePlannedTaskUndo";
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

function pressCtrlZ(target: EventTarget = window, init: KeyboardEventInit = { ctrlKey: true }) {
  const e = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(e));
  return e;
}

async function flush() {
  await act(async () => {});
}

describe("usePlannedTaskUndo", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it("lote vazio (tudo já apagado) não mostra toast", async () => {
    const { result } = setup([]);
    await act(() => result.current.removeWithUndo(["x"]));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("o evento do botão do toast restaura e recarrega", async () => {
    const { result, store, onChanged } = setup(["a", "b"]);
    await act(() => result.current.removeWithUndo(["a", "b"]));
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    await flush();
    expect([...store.keys()].sort()).toEqual(["a", "b"]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("evento entregue duas vezes restaura uma vez só", async () => {
    const { result, repo, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    await flush();
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("Ctrl+Z restaura e consome a tecla", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    const e = pressCtrlZ();
    await flush();
    expect(e.defaultPrevented).toBe(true);
    expect(store.has("a")).toBe(true);
  });

  it("Cmd+Z também restaura", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    pressCtrlZ(window, { metaKey: true });
    await flush();
    expect(store.has("a")).toBe(true);
  });

  it("Ctrl+Z dentro de campo editável é do campo", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    const input = document.createElement("input");
    document.body.appendChild(input);
    const e = pressCtrlZ(input);
    await flush();
    expect(e.defaultPrevented).toBe(false);
    expect(store.has("a")).toBe(false);
  });

  it("Ctrl+Z com modal aberto é ignorado", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    const modal = document.createElement("div");
    modal.setAttribute("data-modal-open", "");
    document.body.appendChild(modal);
    const e = pressCtrlZ();
    await flush();
    expect(e.defaultPrevented).toBe(false);
    expect(store.has("a")).toBe(false);
  });

  it("Ctrl+Z sem lote pendente não consome a tecla", () => {
    const { repo } = setup(["a"]);
    const e = pressCtrlZ();
    expect(e.defaultPrevented).toBe(false);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("depois de 6 s o desfazer expira", async () => {
    vi.useFakeTimers();
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    act(() => vi.advanceTimersByTime(UNDO_WINDOW_MS));
    const e = pressCtrlZ();
    await flush();
    expect(e.defaultPrevented).toBe(false);
    expect(store.has("a")).toBe(false);
  });

  it("exclusão nova substitui o lote anterior", async () => {
    const { result, store } = setup(["a", "b"]);
    await act(() => result.current.removeWithUndo(["a"]));
    await act(() => result.current.removeWithUndo(["b"]));
    pressCtrlZ();
    await flush();
    expect(store.has("b")).toBe(true);
    expect(store.has("a")).toBe(false);
  });

  it("erro na exclusão mostra toast de erro e recarrega", async () => {
    const { result, repo, onChanged } = setup(["a"]);
    vi.mocked(repo.delete).mockRejectedValueOnce(new Error("db"));
    await act(() => result.current.removeWithUndo(["a"]));
    expect(showToast).toHaveBeenCalledWith("error", "Não foi possível excluir.");
    expect(onChanged).toHaveBeenCalledTimes(1);
    const e = pressCtrlZ();
    expect(e.defaultPrevented).toBe(false);
  });
  it("erro no restauro mostra toast de erro, recarrega e consome o lote", async () => {
    const { result, repo, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    vi.mocked(repo.save).mockRejectedValueOnce(new Error("db"));
    fire(OVERLAY_EVENTS.PLANNED_TASKS_UNDO_DELETE);
    await flush();
    expect(showToast).toHaveBeenCalledWith("error", "Não foi possível desfazer.");
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(pressCtrlZ().defaultPrevented).toBe(false);
  });

  it("Ctrl+Z dentro de contenteditable é do campo", async () => {
    const { result, store } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inner = document.createElement("span");
    editor.appendChild(inner);
    document.body.appendChild(editor);
    const e = pressCtrlZ(inner);
    await flush();
    expect(e.defaultPrevented).toBe(false);
    expect(store.has("a")).toBe(false);
  });
});
