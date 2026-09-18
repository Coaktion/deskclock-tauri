import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";
import type { LocalApiDeps, LocalApiResult } from "@presentation/localApi/types";
import { useLocalApiBridge } from "@presentation/localApi/useLocalApiBridge";
import { makeTask, WS_ATIVO } from "./fakeDeps";

// Barramento do Tauri substituído: o teste decide quando o `listen` resolve e
// dispara as requisições como se viessem do Rust.
type RequestHandler = (event: { payload: unknown }) => void;
const bus = vi.hoisted(() => ({
  handlers: [] as RequestHandler[],
  resolvers: [] as (() => void)[],
  unlisten: (() => {}) as () => void,
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => undefined as unknown),
  dispatch: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  // Guarda todos os ouvintes: é assim que se reproduz o ouvinte duplicado.
  listen: (_event: string, handler: RequestHandler) => {
    bus.handlers.push(handler);
    return new Promise<() => void>((resolve) => {
      bus.resolvers.push(() => resolve(() => bus.unlisten()));
    });
  },
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: bus.invoke }));

vi.mock("@presentation/localApi/dispatch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@presentation/localApi/dispatch")>()),
  dispatchLocalApiRequest: bus.dispatch,
}));

let running: Partial<RunningTaskContextValue> = { runningTask: null };
vi.mock("@presentation/hooks/useRunningTask", () => ({ useRunningTask: () => running }));
vi.mock("@presentation/contexts/RepositoriesContext", () => ({ useRepositories: () => ({}) }));
vi.mock("@presentation/contexts/WorkspaceContext", () => ({
  useWorkspaces: () => ({ activeWorkspaceId: WS_ATIVO, switchTo: vi.fn() }),
}));
vi.mock("@presentation/contexts/ConfigContext", () => ({
  useAppConfig: () => ({ isLoaded: true, get: () => 1, set: vi.fn() }),
}));
vi.mock("@presentation/hooks/useWorkspaceAdmin", () => ({
  useWorkspaceAdmin: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));

const OK: LocalApiResult = { status: 200, body: {} };

function request(id: string, op: string) {
  bus.handlers.forEach((handler) => handler({ payload: { id, op, params: {} } }));
}

function respondCount(id: string) {
  return bus.invoke.mock.calls.filter(
    ([cmd, args]) => cmd === "local_api_respond" && (args as { id: string }).id === id
  ).length;
}

const resolveAll = () => bus.resolvers.forEach((resolve) => resolve());

function responded(id: string) {
  return bus.invoke.mock.calls.some(
    ([cmd, args]) => cmd === "local_api_respond" && (args as { id: string }).id === id
  );
}

async function mountReady() {
  const hook = renderHook(() => useLocalApiBridge());
  await act(async () => resolveAll());
  return hook;
}

describe("useLocalApiBridge", () => {
  beforeEach(() => {
    bus.handlers = [];
    bus.resolvers = [];
    bus.unlisten = () => {};
    globalThis.__deskclockLocalApiSeenIds = undefined;
    bus.invoke.mockClear();
    bus.dispatch.mockReset();
    running = { runningTask: null };
  });

  it("só avisa a prontidão depois de o ouvinte estar registrado", async () => {
    renderHook(() => useLocalApiBridge());
    await act(async () => {});
    expect(bus.invoke).not.toHaveBeenCalledWith("local_api_bridge_ready");

    await act(async () => resolveAll());
    expect(bus.invoke).toHaveBeenCalledWith("local_api_bridge_ready");
  });

  it("despacha a segunda op de tarefa com a tarefa em execução do commit seguinte à primeira", async () => {
    const primeira = makeTask({ id: "antes" });
    const segunda = makeTask({ id: "depois", status: "paused" });
    running = { runningTask: primeira };
    const vistas: (string | undefined)[] = [];
    bus.dispatch.mockImplementation(async (deps: LocalApiDeps) => {
      vistas.push(deps.running.runningTask?.id);
      return OK;
    });
    const { rerender } = await mountReady();

    await act(async () => {
      request("r1", "tasks.pause");
      request("r2", "tasks.resume");
    });
    await vi.waitFor(() => expect(responded("r1")).toBe(true));
    // A primeira já respondeu, mas a fila segura a segunda até o render novo.
    expect(bus.dispatch).toHaveBeenCalledTimes(1);

    running = { runningTask: segunda as Task };
    rerender();

    // 200 < COMMIT_WAIT_MS (300): se passar, foi o commit que liberou a fila, não o teto.
    await vi.waitFor(() => expect(responded("r2")).toBe(true), { timeout: 200 });
    expect(vistas).toEqual(["antes", "depois"]);
  });

  it("uma op que falha não trava a fila", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    bus.dispatch.mockRejectedValueOnce(new Error("quebrou")).mockResolvedValueOnce(OK);
    await mountReady();

    await act(async () => {
      request("r1", "plannedTasks.list");
      request("r2", "plannedTasks.list");
    });

    await vi.waitFor(() => expect(responded("r2")).toBe(true));
    expect(bus.dispatch).toHaveBeenCalledTimes(2);
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });

  it("com dois ouvintes vivos, a mesma requisição executa e responde uma vez só", async () => {
    bus.dispatch.mockResolvedValue(OK);
    await mountReady();
    await mountReady();
    expect(bus.handlers).toHaveLength(2);

    await act(async () => request("r1", "history.create"));
    await vi.waitFor(() => expect(responded("r1")).toBe(true));
    await act(async () => {});

    expect(bus.dispatch).toHaveBeenCalledTimes(1);
    expect(respondCount("r1")).toBe(1);
  });

  it("ids diferentes continuam executando cada um", async () => {
    bus.dispatch.mockResolvedValue(OK);
    await mountReady();
    await mountReady();

    await act(async () => {
      request("r1", "history.create");
      request("r2", "history.create");
    });
    await vi.waitFor(() => expect(responded("r2")).toBe(true));
    await act(async () => {});

    expect(bus.dispatch).toHaveBeenCalledTimes(2);
    expect(respondCount("r1")).toBe(1);
    expect(respondCount("r2")).toBe(1);
  });

  it("falha ao remover o ouvinte é logada e não quebra a desmontagem", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    bus.unlisten = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'handlerId')");
    };
    const { unmount } = await mountReady();

    expect(() => unmount()).not.toThrow();
    await vi.waitFor(() =>
      expect(erro).toHaveBeenCalledWith(
        "[local-api] falha ao remover o ouvinte da ponte",
        expect.any(TypeError)
      )
    );
    erro.mockRestore();
  });

  it("ouvinte de efeito já limpo não executa: a requisição roda na instância remontada", async () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const vistas: (string | undefined)[] = [];
    bus.dispatch.mockImplementation(async (deps: LocalApiDeps) => {
      vistas.push(deps.running.runningTask?.id);
      return OK;
    });
    // Remoção que lança deixa o ouvinte antigo vivo, como na corrida do Tauri.
    bus.unlisten = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'handlerId')");
    };
    const antiga = await mountReady();
    antiga.unmount();

    running = { runningTask: makeTask({ id: "viva" }) };
    await mountReady();
    expect(bus.handlers).toHaveLength(2);

    await act(async () => request("r1", "history.create"));
    await vi.waitFor(() => expect(responded("r1")).toBe(true));
    await act(async () => {});

    expect(bus.dispatch).toHaveBeenCalledTimes(1);
    expect(respondCount("r1")).toBe(1);
    expect(vistas).toEqual(["viva"]);
    // A instância remontada só desmonta na limpeza automática, já sem o espião.
    bus.unlisten = () => {};
    erro.mockRestore();
  });
});
