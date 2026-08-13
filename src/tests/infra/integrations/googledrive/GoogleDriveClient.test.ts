import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "@shared/types/appConfig";
import type { IDriveBackupPort } from "@domain/integrations/IDriveBackupPort";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const {
  GoogleDriveClient,
  DriveHttpError,
  backupErrorMessage,
  backupFolderName,
  BACKUP_FOLDER_NAME,
  DRIVE_RECONNECT_MESSAGE,
} = await import("@infra/integrations/googledrive/GoogleDriveClient");

const TOKEN = "test-access-token";

/** Salvo o caso de dev, os testes falam da pasta de produção. */
function makeClient(config: IDriveBackupPort, folder = BACKUP_FOLDER_NAME) {
  return new GoogleDriveClient(TOKEN, config, folder);
}

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

describe("backupFolderName", () => {
  it("separa dev de produção, e não por acaso: a poda é por pasta", () => {
    expect(backupFolderName(false)).toBe(BACKUP_FOLDER_NAME);
    expect(backupFolderName(true)).toBe(`${BACKUP_FOLDER_NAME} (dev)`);
  });
});

describe("GoogleDriveClient", () => {
  describe("ensureBackupFolder", () => {
    it("reaproveita a pasta salva sem criar outra", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(
        makeResponse({ id: "folder-salva", name: BACKUP_FOLDER_NAME, trashed: false })
      );

      const id = await makeClient(config).ensureBackupFolder();

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

      const id = await makeClient(config).ensureBackupFolder();

      expect(id).toBe("folder-nova");
      expect(config.set).toHaveBeenCalledWith("driveBackupFolderId", "folder-nova");
      expect(mockFetch.mock.calls[2][1]).toMatchObject({ method: "POST" });
    });

    it("trata a pasta na lixeira como inexistente", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-na-lixeira" });
      mockFetch
        .mockResolvedValueOnce(
          makeResponse({ id: "folder-na-lixeira", name: BACKUP_FOLDER_NAME, trashed: true })
        )
        .mockResolvedValueOnce(makeResponse({ files: [] }))
        .mockResolvedValueOnce(makeResponse({ id: "folder-nova" }));

      await expect(makeClient(config).ensureBackupFolder()).resolves.toBe("folder-nova");
    });

    it("acha a pasta pelo nome antes de criar uma segunda", async () => {
      const config = makeConfig();
      mockFetch.mockResolvedValueOnce(makeResponse({ files: [{ id: "folder-existente" }] }));

      const id = await makeClient(config).ensureBackupFolder();

      expect(id).toBe("folder-existente");
      expect(urls()[0]).toContain(encodeURIComponent(`name = '${BACKUP_FOLDER_NAME}'`));
      expect(config.set).toHaveBeenCalledWith("driveBackupFolderId", "folder-existente");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // O dev que já rodou backup antes das duas pastas tem salvo, no banco de dev,
    // o id da pasta de produção. Sem a conferência do nome ele continuaria válido
    // para sempre, e o dev nunca sairia de lá.
    it("descarta a pasta salva cujo nome não é mais o esperado", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-de-producao" });
      mockFetch
        .mockResolvedValueOnce(
          makeResponse({ id: "folder-de-producao", name: BACKUP_FOLDER_NAME, trashed: false })
        )
        .mockResolvedValueOnce(makeResponse({ files: [] }))
        .mockResolvedValueOnce(makeResponse({ id: "folder-dev" }));

      const id = await makeClient(config, backupFolderName(true)).ensureBackupFolder();

      expect(id).toBe("folder-dev");
      expect(config.set).toHaveBeenCalledWith("driveBackupFolderId", "folder-dev");
    });

    it("procura e cria a pasta de dev com o nome próprio", async () => {
      const config = makeConfig();
      mockFetch
        .mockResolvedValueOnce(makeResponse({ files: [] }))
        .mockResolvedValueOnce(makeResponse({ id: "folder-dev" }));

      await makeClient(config, backupFolderName(true)).ensureBackupFolder();

      expect(urls()[0]).toContain(encodeURIComponent(`name = '${backupFolderName(true)}'`));
      expect(mockFetch.mock.calls[1][1]).toMatchObject({
        body: JSON.stringify({
          name: backupFolderName(true),
          mimeType: "application/vnd.google-apps.folder",
        }),
      });
    });

    it("propaga o 403 em vez de criar pasta nova a cada tentativa", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(
        makeResponse({ error: { message: "Insufficient scopes" } }, 403)
      );

      await expect(makeClient(config).ensureBackupFolder()).rejects.toThrow(DriveHttpError);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(config.set).not.toHaveBeenCalled();
    });

    it("envia o token em toda chamada", async () => {
      const config = makeConfig({ driveBackupFolderId: "folder-salva" });
      mockFetch.mockResolvedValueOnce(
        makeResponse({ id: "folder-salva", name: BACKUP_FOLDER_NAME, trashed: false })
      );

      await makeClient(config).ensureBackupFolder();

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

      const files = await makeClient(makeConfig()).listBackups("folder-1");

      expect(files).toHaveLength(1);
      expect(urls()[0]).toContain(encodeURIComponent("'folder-1' in parents"));
      expect(urls()[0]).toContain("orderBy=createdTime desc");
    });

    it("devolve lista vazia quando a pasta está vazia", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({}));

      await expect(makeClient(makeConfig()).listBackups("folder-1")).resolves.toEqual([]);
    });
  });

  describe("deleteFile", () => {
    it("tolera o arquivo já apagado à mão", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ error: { message: "Not found" } }, 404));

      await expect(makeClient(makeConfig()).deleteFile("f1")).resolves.toBeUndefined();
    });

    it("propaga qualquer outra falha", async () => {
      mockFetch.mockResolvedValueOnce(makeResponse({ error: { message: "Backend error" } }, 500));

      await expect(makeClient(makeConfig()).deleteFile("f1")).rejects.toThrow("Backend error");
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
