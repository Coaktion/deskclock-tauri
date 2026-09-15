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
  handler: null as RequestHandler | null,
  resolveListen: null as (() => void) | null,
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => undefined as unknown),
  dispatch: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: (_event: string, handler: RequestHandler) => {
    bus.handler = handler;
    return new Promise<() => void>((resolve) => {
      bus.resolveListen = () => resolve(() => {});
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
vi.mock("@presentation/hooks/useWorkspaceAdmin", () => ({
  useWorkspaceAdmin: () => ({ create: vi.fn(), update: vi.fn(), remove: vi.fn() }),
}));

const OK: LocalApiResult = { status: 200, body: {} };

function request(id: string, op: string) {
  bus.handler?.({ payload: { id, op, params: {} } });
}

function responded(id: string) {
  return bus.invoke.mock.calls.some(
    ([cmd, args]) => cmd === "local_api_respond" && (args as { id: string }).id === id
  );
}

async function mountReady() {
  const hook = renderHook(() => useLocalApiBridge());
  await act(async () => bus.resolveListen?.());
  return hook;
}

describe("useLocalApiBridge", () => {
  beforeEach(() => {
    bus.handler = null;
    bus.resolveListen = null;
    bus.invoke.mockClear();
    bus.dispatch.mockReset();
    running = { runningTask: null };
  });

  it("só avisa a prontidão depois de o ouvinte estar registrado", async () => {
    renderHook(() => useLocalApiBridge());
    await act(async () => {});
    expect(bus.invoke).not.toHaveBeenCalledWith("local_api_bridge_ready");

    await act(async () => bus.resolveListen?.());
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
});
