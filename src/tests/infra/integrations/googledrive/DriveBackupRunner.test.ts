import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import type { AppConfig } from "@shared/types/appConfig";
import type { IDriveBackupPort } from "@domain/integrations/IDriveBackupPort";
import type { IGoogleAuthPort } from "@domain/integrations/IGoogleAuthPort";
import { SECRET_CONFIG_KEYS } from "@shared/constants/secretConfigKeys";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// O token é problema do `GoogleTokenManager`, que tem teste próprio: aqui ele
// sai pronto para o resto da execução ser observável sem rede de OAuth.
vi.mock("@infra/integrations/google/GoogleTokenManager", () => ({
  GoogleTokenManager: vi.fn().mockImplementation(() => ({
    getValidAccessToken: vi.fn().mockResolvedValue("test-access-token"),
  })),
}));

// Quem decide dev/produção é o Rust, e o `db` inteiro viria junto num import real.
// O padrão é produção: é o que vale em toda instalação do usuário.
const mockIsDevDatabase = vi.fn().mockResolvedValue(false);
vi.mock("@infra/database/db", () => ({
  isDevDatabase: () => mockIsDevDatabase(),
}));

const { DriveBackupRunner, backupFileName } =
  await import("@infra/integrations/googledrive/DriveBackupRunner");
const { DRIVE_RECONNECT_MESSAGE, BACKUP_FOLDER_NAME, backupFolderName } =
  await import("@infra/integrations/googledrive/GoogleDriveClient");

const mockInvoke = vi.mocked(invoke);
const NOW = new Date("2026-08-12T14:30:00");

interface Store extends Partial<AppConfig> {
  driveBackupFolderId: string;
  driveBackupKeepCount: number;
  driveBackupLastRunAt: number;
  driveBackupLastError: string;
}

function makeConfig(overrides: Partial<AppConfig> = {}) {
  const store = {
    driveBackupFolderId: "folder-1",
    driveBackupKeepCount: 3,
    driveBackupLastRunAt: 0,
    driveBackupLastError: "",
    ...overrides,
  } as Store;
  const config = {
    get: vi.fn(<K extends keyof AppConfig>(key: K) => store[key] as AppConfig[K]),
    set: vi.fn(async <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      (store as Partial<AppConfig>)[key] = value;
    }),
  } as unknown as IDriveBackupPort & IGoogleAuthPort;
  return { config, store };
}

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function backup(name: string) {
  return { id: name, name, createdTime: "2026-08-12T14:30:00Z" };
}

/** Cada `run` pergunta pela pasta, depois lista para podar; o resto é DELETE. */
function stubDrive(backups: ReturnType<typeof backup>[]) {
  mockFetch
    .mockResolvedValueOnce(
      makeResponse({ id: "folder-1", name: BACKUP_FOLDER_NAME, trashed: false })
    )
    .mockResolvedValueOnce(makeResponse({ files: backups }));
  mockFetch.mockResolvedValue(makeResponse({}, 204));
}

function deletedIds(): string[] {
  return mockFetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "DELETE")
    .map(([url]) => decodeURIComponent((url as string).split("/files/")[1]));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockFetch.mockReset();
  mockInvoke.mockReset();
  mockInvoke.mockResolvedValue("file-novo");
  mockIsDevDatabase.mockReset();
  mockIsDevDatabase.mockResolvedValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("backupFileName", () => {
  it("nomeia pelo instante local, com minuto", () => {
    expect(backupFileName(NOW)).toBe("deskclock-2026-08-12-1430.db");
  });
});

describe("DriveBackupRunner", () => {
  it("sobe o backup na pasta e devolve o id do arquivo", async () => {
    const { config } = makeConfig();
    stubDrive([]);

    await expect(new DriveBackupRunner(config).run()).resolves.toBe("file-novo");

    expect(mockInvoke).toHaveBeenCalledWith("backup_db_to_drive", {
      accessToken: "test-access-token",
      folderId: "folder-1",
      fileName: "deskclock-2026-08-12-1430.db",
      secretKeys: [...SECRET_CONFIG_KEYS],
    });
  });

  it("carimba o sucesso e limpa o erro anterior", async () => {
    const { config, store } = makeConfig({ driveBackupLastError: "Falha antiga" });
    stubDrive([]);

    await new DriveBackupRunner(config).run();

    expect(store.driveBackupLastRunAt).toBe(NOW.getTime());
    expect(store.driveBackupLastError).toBe("");
  });

  it("não avança o carimbo quando o envio falha", async () => {
    const { config, store } = makeConfig({ driveBackupLastRunAt: 123 });
    mockFetch.mockResolvedValueOnce(
      makeResponse({ id: "folder-1", name: BACKUP_FOLDER_NAME, trashed: false })
    );
    mockInvoke.mockRejectedValue("Falha ao enviar o backup: rede indisponível");

    await expect(new DriveBackupRunner(config).run()).rejects.toThrow("rede indisponível");

    expect(store.driveBackupLastRunAt).toBe(123);
    expect(store.driveBackupLastError).toBe("Falha ao enviar o backup: rede indisponível");
  });

  it("traduz o 403 do comando em pedido de reconexão", async () => {
    const { config, store } = makeConfig();
    mockFetch.mockResolvedValueOnce(
      makeResponse({ id: "folder-1", name: BACKUP_FOLDER_NAME, trashed: false })
    );
    mockInvoke.mockRejectedValue("Drive respondeu 403: insufficient authentication scopes");

    await expect(new DriveBackupRunner(config).run()).rejects.toThrow(DRIVE_RECONNECT_MESSAGE);

    expect(store.driveBackupLastError).toBe(DRIVE_RECONNECT_MESSAGE);
  });

  it("apaga só o que excede o keepCount, do mais velho", async () => {
    const { config } = makeConfig({ driveBackupKeepCount: 3 });
    stubDrive([backup("novo"), backup("n2"), backup("n3"), backup("velho-1"), backup("velho-2")]);

    await new DriveBackupRunner(config).run();

    expect(deletedIds()).toEqual(["velho-1", "velho-2"]);
  });

  it("não poda nada quando o keepCount é zero", async () => {
    const { config } = makeConfig({ driveBackupKeepCount: 0 });
    stubDrive([backup("a"), backup("b")]);

    await new DriveBackupRunner(config).run();

    expect(deletedIds()).toEqual([]);
  });

  it("mantém o sucesso quando a poda falha", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { config, store } = makeConfig();
    mockFetch
      .mockResolvedValueOnce(
        makeResponse({ id: "folder-1", name: BACKUP_FOLDER_NAME, trashed: false })
      )
      .mockResolvedValueOnce(makeResponse({ error: { message: "Backend error" } }, 500));

    await expect(new DriveBackupRunner(config).run()).resolves.toBe("file-novo");

    expect(store.driveBackupLastRunAt).toBe(NOW.getTime());
    expect(store.driveBackupLastError).toBe("");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  // Sem isto, os snapshots de um `pnpm tauri dev` entram na fila da poda de
  // produção e empurram para fora o backup que interessa.
  it("manda o banco de dev para a pasta de dev", async () => {
    mockIsDevDatabase.mockResolvedValue(true);
    const { config, store } = makeConfig({ driveBackupFolderId: "" });
    mockFetch
      .mockResolvedValueOnce(makeResponse({ files: [] }))
      .mockResolvedValueOnce(makeResponse({ id: "folder-dev" }))
      .mockResolvedValueOnce(makeResponse({ files: [] }));

    await new DriveBackupRunner(config).run();

    expect(mockFetch.mock.calls[0][0]).toContain(
      encodeURIComponent(`name = '${backupFolderName(true)}'`)
    );
    expect(store.driveBackupFolderId).toBe("folder-dev");
    expect(mockInvoke).toHaveBeenCalledWith(
      "backup_db_to_drive",
      expect.objectContaining({ folderId: "folder-dev" })
    );
  });

  it("recria a pasta apagada antes de enviar, e envia para a nova", async () => {
    const { config, store } = makeConfig();
    mockFetch
      .mockResolvedValueOnce(makeResponse({ error: { message: "File not found" } }, 404))
      .mockResolvedValueOnce(makeResponse({ files: [] }))
      .mockResolvedValueOnce(makeResponse({ id: "folder-2" }))
      .mockResolvedValueOnce(makeResponse({ files: [] }));

    await new DriveBackupRunner(config).run();

    expect(store.driveBackupFolderId).toBe("folder-2");
    expect(mockInvoke).toHaveBeenCalledWith(
      "backup_db_to_drive",
      expect.objectContaining({ folderId: "folder-2" })
    );
  });
});
