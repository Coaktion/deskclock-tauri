import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { UNDO_WINDOW_MS, useUndoableDelete } from "@presentation/hooks/useUndoableDelete";
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

const UNDO_EVENT = "test:undo-delete";

interface Item {
  id: string;
}

/**
 * "Banco" em memória com apagar/restaurar no contrato dos use cases: apagar
 * devolve só o que existia, restaurar pula o que já voltou.
 */
function makeStore(ids: string[]) {
  const store = new Map<string, Item>(ids.map((id) => [id, { id }]));
  const remove = vi.fn(async (toRemove: string[]) => {
    const snapshots: Item[] = [];
    for (const id of toRemove) {
      const item = store.get(id);
      if (!item) continue;
      store.delete(id);
      snapshots.push(item);
    }
    return snapshots;
  });
  const restore = vi.fn(async (snapshots: Item[]) => {
    for (const s of snapshots) if (!store.has(s.id)) store.set(s.id, s);
  });
  return { store, remove, restore };
}

function mount(fake: ReturnType<typeof makeStore>) {
  const onChanged = vi.fn(async () => {});
  const { result, unmount } = renderHook(() =>
    useUndoableDelete<Item>({
      remove: fake.remove,
      restore: fake.restore,
      deletedMessage: (n) => (n === 1 ? "Item excluído" : `${n} itens excluídos`),
      undoEvent: UNDO_EVENT,
      onChanged,
    })
  );
  return { result, unmount, onChanged };
}

function setup(ids: string[]) {
  const fake = makeStore(ids);
  return { ...fake, ...mount(fake) };
}

function pressCtrlZ(target: EventTarget = window, init: KeyboardEventInit = { ctrlKey: true }) {
  const e = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true, ...init });
  act(() => void target.dispatchEvent(e));
  return e;
}

async function flush() {
  await act(async () => {});
}

describe("useUndoableDelete", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("apaga, recarrega e mostra o toast com a ação de desfazer", async () => {
    const { result, store, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    expect(store.has("a")).toBe(false);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(showToast).toHaveBeenCalledWith(
      "success",
      "Item excluído",
      UNDO_WINDOW_MS,
      "Desfazer",
      UNDO_EVENT
    );
  });

  it("lote: um toast só, com o texto da quantidade", async () => {
    const { result } = setup(["a", "b", "c"]);
    await act(() => result.current.removeWithUndo(["a", "b", "c"]));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showToast).mock.calls[0][1]).toBe("3 itens excluídos");
  });

  it("lote vazio (tudo já apagado) não mostra toast", async () => {
    const { result } = setup([]);
    await act(() => result.current.removeWithUndo(["x"]));
    expect(showToast).not.toHaveBeenCalled();
  });

  it("o evento do botão do toast restaura e recarrega", async () => {
    const { result, store, onChanged } = setup(["a", "b"]);
    await act(() => result.current.removeWithUndo(["a", "b"]));
    fire(UNDO_EVENT);
    await flush();
    expect([...store.keys()].sort()).toEqual(["a", "b"]);
    expect(onChanged).toHaveBeenCalledTimes(2);
  });

  it("evento entregue duas vezes restaura uma vez só", async () => {
    const { result, restore, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    fire(UNDO_EVENT);
    fire(UNDO_EVENT);
    await flush();
    expect(restore).toHaveBeenCalledTimes(1);
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
    const { restore } = setup(["a"]);
    const e = pressCtrlZ();
    expect(e.defaultPrevented).toBe(false);
    expect(restore).not.toHaveBeenCalled();
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

  it("erro na exclusão mostra toast de erro e recarrega, sem lote pendente", async () => {
    const { result, remove, onChanged } = setup(["a"]);
    remove.mockRejectedValueOnce(new Error("db"));
    await act(() => result.current.removeWithUndo(["a"]));
    expect(showToast).toHaveBeenCalledWith("error", "Não foi possível excluir.");
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(pressCtrlZ().defaultPrevented).toBe(false);
  });

  it("erro no restauro mostra toast de erro, recarrega e consome o lote", async () => {
    const { result, restore, onChanged } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    restore.mockRejectedValueOnce(new Error("db"));
    fire(UNDO_EVENT);
    await flush();
    expect(showToast).toHaveBeenCalledWith("error", "Não foi possível desfazer.");
    expect(onChanged).toHaveBeenCalledTimes(2);
    expect(pressCtrlZ().defaultPrevented).toBe(false);
  });

  it("desmontar descarta o lote pendente", async () => {
    const { result, restore, unmount } = setup(["a"]);
    await act(() => result.current.removeWithUndo(["a"]));
    unmount();
    fire(UNDO_EVENT);
    expect(pressCtrlZ().defaultPrevented).toBe(false);
    await flush();
    expect(restore).not.toHaveBeenCalled();
  });

  describe("duas instâncias com o mesmo evento (Planejamento e popup)", () => {
    it("o evento do toast só restaura na que apagou", async () => {
      const fake = makeStore(["a"]);
      const deleter = mount(fake);
      const other = mount(fake);

      await act(() => deleter.result.current.removeWithUndo(["a"]));
      fire(UNDO_EVENT);
      await flush();

      expect(fake.store.has("a")).toBe(true);
      expect(fake.restore).toHaveBeenCalledTimes(1);
      expect(deleter.onChanged).toHaveBeenCalledTimes(2);
      expect(other.onChanged).not.toHaveBeenCalled();
    });

    it("com as duas pendentes, cada uma restaura só o próprio lote", async () => {
      const fake = makeStore(["a", "b"]);
      const first = mount(fake);
      const second = mount(fake);

      await act(() => first.result.current.removeWithUndo(["a"]));
      await act(() => second.result.current.removeWithUndo(["b"]));
      fire(UNDO_EVENT);
      await flush();

      expect(fake.restore).toHaveBeenCalledTimes(2);
      expect(fake.restore).toHaveBeenCalledWith([{ id: "a" }]);
      expect(fake.restore).toHaveBeenCalledWith([{ id: "b" }]);
    });
  });
});
