import { describe, it, expect, vi } from "vitest";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps } from "../fakeDeps";

const STATUS = {
  connected: true,
  enabled: false,
  frequency: "weekly",
  lastRunAt: null,
  lastError: null,
  needsReconnect: false,
  folderName: "DeskClock Backups",
};

function setup(notConfiguredMessage: string | null = null, run = vi.fn(async () => "file-1")) {
  const deps = makeDeps();
  deps.driveBackup.mockReturnValue({
    notConfiguredMessage,
    status: vi.fn(async () => STATUS),
    run,
  });
  return { deps, run };
}

describe("driveBackup.status", () => {
  it("devolve o estado, mesmo sem o Google conectado", async () => {
    const { deps } = setup("Google não conectado.");
    const res = await dispatchLocalApiRequest(deps, "driveBackup.status", {});
    expect(res).toEqual({ status: 200, body: STATUS });
  });
});

describe("driveBackup.run", () => {
  it("roda o backup e devolve o arquivo e o estado novo", async () => {
    const { deps, run } = setup();
    const res = await dispatchLocalApiRequest(deps, "driveBackup.run", {});
    expect(run).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ status: 200, body: { fileId: "file-1", status: STATUS } });
  });

  it("sem o Google conectado é 409 e não roda", async () => {
    const { deps, run } = setup("Google não conectado.");
    expect((await dispatchLocalApiRequest(deps, "driveBackup.run", {})).status).toBe(409);
    expect(run).not.toHaveBeenCalled();
  });

  it("falha do Drive é 502 com a mensagem da tela", async () => {
    const run = vi.fn(async (): Promise<string> => {
      throw new Error("Reconecte o Google para conceder acesso ao Drive e refazer o backup.");
    });
    const { deps } = setup(null, run);
    const res = await dispatchLocalApiRequest(deps, "driveBackup.run", {});
    expect(res).toEqual({
      status: 502,
      body: { error: "Reconecte o Google para conceder acesso ao Drive e refazer o backup." },
    });
  });
});
