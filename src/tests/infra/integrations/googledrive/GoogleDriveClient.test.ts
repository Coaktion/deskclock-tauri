import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "@shared/types/appConfig";
import type { IDriveBackupPort } from "@domain/integrations/IDriveBackupPort";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const {
  GoogleDriveClient,
  DriveHttpError,
  backupErrorMessage,
  BACKUP_FOLDER_NAME,
  DRIVE_RECONNECT_MESSAGE,
} = await import("@infra/integrations/googledrive/GoogleDriveClient");

const TOKEN = "test-access-token";

function makeConfig(overrides: Partial<AppConfig> = {}): IDriveBackupPort {
  const store: Partial<AppConfig> = {
    driveBackupFolderId: "",
    driveBackupKeepCount: 10,
    ...overrides,
  };
  return {
    get: vi.fn(<K extends keyof AppConfig>(key: K) => store[key] as AppConfig[K]),
    set: vi.fn(async <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      store[key] = value;
    }),
  } as IDriveBackupPort;
}

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

/** URL de cada chamada, na ordem — é onde a query do Drive é conferida. */
function urls(): string[] {
  return mockFetch.mock.calls.map(([url]) => url as string);
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("GoogleDriveClient", () => {
  describe("ensureBackupFolder", () => {
    it("reaproveita a pasta salva sem criar outra", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(makeResponse({ id: "folder-salva", trashed: false }));

      const id = await new GoogleDriveClient(TOKEN, config).ensureBackupFolder();

      expect(id).toBe("folder-salva");
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(urls()[0]).toContain("/files/folder-salva");
      expect(config.set).not.toHaveBeenCalled();
    });

    it("recria a pasta quando o usuário a apagou, e persiste o id novo", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-apagada" });
      mockFetch
        .mockResolvedValueOnce(makeResponse({ error: { message: "File not found" } }, 404))
        .mockResolvedValueOnce(makeResponse({ files: [] }))
        .mockResolvedValueOnce(makeResponse({ id: "folder-nova" }));

      const id = await new GoogleDriveClient(TOKEN, config).ensureBackupFolder();

      expect(id).toBe("folder-nova");
      expect(config.set).toHaveBeenCalledWith("driveBackupFolderId", "folder-nova");
      expect(mockFetch.mock.calls[2][1]).toMatchObject({ method: "POST" });
    });

    it("trata a pasta na lixeira como inexistente", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-na-lixeira" });
      mockFetch
        .mockResolvedValueOnce(makeResponse({ id: "folder-na-lixeira", trashed: true }))
        .mockResolvedValueOnce(makeResponse({ files: [] }))
        .mockResolvedValueOnce(makeResponse({ id: "folder-nova" }));

      await expect(new GoogleDriveClient(TOKEN, config).ensureBackupFolder()).resolves.toBe(
        "folder-nova"
      );
    });

    it("acha a pasta pelo nome antes de criar uma segunda", async () => {
      const config = makeConfig();
      mockFetch.mockResolvedValueOnce(makeResponse({ files: [{ id: "folder-existente" }] }));

      const id = await new GoogleDriveClient(TOKEN, config).ensureBackupFolder();

      expect(id).toBe("folder-existente");
      expect(urls()[0]).toContain(encodeURIComponent(`name = '${BACKUP_FOLDER_NAME}'`));
      expect(config.set).toHaveBeenCalledWith("driveBackupFolderId", "folder-existente");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("propaga o 403 em vez de criar pasta nova a cada tentativa", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(
        makeResponse({ error: { message: "Insufficient scopes" } }, 403)
      );

      await expect(new GoogleDriveClient(TOKEN, config).ensureBackupFolder()).rejects.toThrow(
        DriveHttpError
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(config.set).not.toHaveBeenCalled();
    });

    it("envia o token em toda chamada", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(makeResponse({ id: "folder-salva" }));

      await new GoogleDriveClient(TOKEN, config).ensureBackupFolder();

      expect(mockFetch.mock.calls[0][1]).toMatchObject({
        headers: expect.objectContaining({ Authorization: `Bearer ${TOKEN}` }),
      });
    });
  });

  describe("listBackups", () => {
    it("pede a pasta, do mais novo para o mais velho", async () => {
      mockFetch.mockResolvedValueOnce(
        makeResponse({ files: [{ id: "f1", name: "a.db", createdTime: "2026-08-12T14:30:00Z" }] })
      );

      const files = await new GoogleDriveClient(TOKEN, makeConfig()).listBackups("folder-1");

      expect(files).toHaveLength(1);
      expect(urls()[0]).toContain(encodeURIComponent("'folder-1' in parents"));
      expect(urls()[0]).toContain("orderBy=createdTime desc");
    });

    it("devolve lista vazia quando a pasta está vazia", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}));

      await expect(
        new GoogleDriveClient(TOKEN, makeConfig()).listBackups("folder-1")
      ).resolves.toEqual([]);
    });
  });

  describe("deleteFile", () => {
    it("tolera o arquivo já apagado à mão", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ error: { message: "Not found" } }, 404));

      await expect(
        new GoogleDriveClient(TOKEN, makeConfig()).deleteFile("f1")
      ).resolves.toBeUndefined();
    });

    it("propaga qualquer outra falha", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ error: { message: "Backend error" } }, 500));

      await expect(new GoogleDriveClient(TOKEN, makeConfig()).deleteFile("f1")).rejects.toThrow(
        "Backend error"
      );
    });
  });

  describe("backupErrorMessage", () => {
    it("converte o 403 das chamadas JSON na mensagem de reconexão", () => {
      const err = new DriveHttpError(403, "Request had insufficient authentication scopes.");
      expect(backupErrorMessage(err)).toBe(DRIVE_RECONNECT_MESSAGE);
    });

    it("converte também o 403 que volta do comando Rust como string", () => {
      expect(backupErrorMessage("Drive respondeu 403: insufficient scopes")).toBe(
        DRIVE_RECONNECT_MESSAGE
      );
    });

    it("preserva o texto das demais falhas", () => {
      expect(backupErrorMessage(new DriveHttpError(500, "Backend error"))).toBe("Backend error");
      expect(backupErrorMessage(new Error("Falha ao enviar o backup: rede"))).toBe(
        "Falha ao enviar o backup: rede"
      );
    });
  });
});
