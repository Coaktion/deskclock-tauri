import type { IDriveBackupPort } from "@domain/integrations/IDriveBackupPort";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * Visível no Drive de propósito: o backup existe para o usuário poder baixar o
 * banco sem passar pelo app. Numa pasta oculta (`appDataFolder`) ele dependeria
 * do app que talvez seja justamente o que quebrou.
 */
export const BACKUP_FOLDER_NAME = "DeskClock Backups";

/** Mensagem do 403 — ver `backupErrorMessage`. */
export const DRIVE_RECONNECT_MESSAGE =
  "Reconecte o Google para conceder acesso ao Drive e refazer o backup.";

export interface DriveFile {
  id: string;
  name: string;
  createdTime: string;
}

export class DriveHttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "DriveHttpError";
  }
}

/**
 * Traduz a falha do backup para a frase que a tela exibe.
 *
 * O 403 é o único caso com tratamento próprio, e não é zelo de redação: ele
 * significa "o `refresh_token` guardado não carrega o escopo do Drive", e a
 * única saída é reconectar o Google. Como texto cru da API — "Request had
 * insufficient authentication scopes" — ele aparece como falha genérica, e quem
 * viu não descobre o que fazer; tentar de novo dá no mesmo para sempre.
 *
 * O 403 chega por dois caminhos, e os dois passam por aqui: `DriveHttpError`
 * das chamadas JSON, e a string do comando Rust, que carrega o código no texto
 * (`Drive respondeu 403: …`) porque `invoke` rejeita com string, não com `Error`.
 */
export function backupErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const forbidden = err instanceof DriveHttpError ? err.status === 403 : /\b403\b/.test(raw);
  return forbidden ? DRIVE_RECONNECT_MESSAGE : raw;
}

/**
 * Chamadas JSON do Drive: pasta e poda. O upload não está aqui — ele é do
 * comando Rust, que é quem alcança o arquivo do banco (§ Fase 0 do plano).
 *
 * O token vem pronto no construtor, e não de um `GoogleTokenManager` interno,
 * porque a mesma execução do backup usa **um** token do começo ao fim: o que
 * localizou a pasta é o que o Rust leva no upload. Renovar no meio faria o
 * comando subir com um token que ninguém validou.
 */
export class GoogleDriveClient {
  constructor(
    private readonly token: string,
    private readonly config: IDriveBackupPort
  ) {}

  /**
   * Devolve o id da pasta de backups, criando-a quando preciso, e persiste o id.
   *
   * A pasta salva é conferida a cada execução: ela é visível, e o usuário pode
   * tê-la apagado ou movido para a lixeira entre um backup e outro. Sem a
   * conferência, o upload seguinte iria para um `parents` que não existe mais e
   * o backup pararia calado até alguém abrir a tela.
   */
  async ensureBackupFolder(): Promise<string> {
    const saved = this.config.get("driveBackupFolderId");
    if (saved && (await this.folderIsUsable(saved))) return saved;

    const folderId = (await this.findFolderByName()) ?? (await this.createFolder());
    await this.config.set("driveBackupFolderId", folderId);
    return folderId;
  }

  /** Backups da pasta, do mais novo para o mais velho — a ordem que a poda usa. */
  async listBackups(folderId: string): Promise<DriveFile[]> {
    const query = `'${folderId}' in parents and trashed = false`;
    const url =
      `${DRIVE_API}?q=${encodeURIComponent(query)}` +
      `&orderBy=createdTime desc&pageSize=100&fields=${encodeURIComponent("files(id,name,createdTime)")}`;
    const body = await this.request<{ files?: DriveFile[] }>(url);
    return body.files ?? [];
  }

  async deleteFile(id: string): Promise<void> {
    try {
      await this.request<void>(`${DRIVE_API}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (err) {
      // Apagado à mão no Drive entre a listagem e agora: o alvo já está no
      // estado que se queria. Mesmo raciocínio do `removeOrphans` do Monday.
      if (!(err instanceof DriveHttpError) || err.status !== 404) throw err;
    }
  }

  private async folderIsUsable(id: string): Promise<boolean> {
    try {
      const file = await this.request<{ trashed?: boolean }>(
        `${DRIVE_API}/${encodeURIComponent(id)}?fields=${encodeURIComponent("id,trashed")}`
      );
      return !file.trashed;
    } catch (err) {
      // Só o "não existe" vira "crie outra". 403 e falha de rede sobem: com o
      // escopo faltante, engolir o erro aqui criaria uma pasta duplicada a cada
      // tentativa — ou tentaria, e o usuário veria o erro errado.
      if (err instanceof DriveHttpError && err.status === 404) return false;
      throw err;
    }
  }

  /**
   * A busca por nome é o que evita a segunda pasta quando o id se perde (banco
   * restaurado, `driveBackupFolderId` expurgado). Com o escopo `drive.file` a
   * listagem só enxerga o que este app criou, então o nome não colide com uma
   * pasta homônima do usuário.
   */
  private async findFolderByName(): Promise<string | null> {
    const query =
      `name = '${BACKUP_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const url =
      `${DRIVE_API}?q=${encodeURIComponent(query)}` +
      `&pageSize=1&fields=${encodeURIComponent("files(id)")}`;
    const body = await this.request<{ files?: { id: string }[] }>(url);
    return body.files?.[0]?.id ?? null;
  }

  private async createFolder(): Promise<string> {
    const body = await this.request<{ id?: string }>(
      `${DRIVE_API}?fields=${encodeURIComponent("id")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: BACKUP_FOLDER_NAME, mimeType: FOLDER_MIME }),
      }
    );
    if (!body.id) throw new Error("O Drive criou a pasta de backups mas não devolveu o id dela.");
    return body.id;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...(init?.headers ?? {}) },
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new DriveHttpError(
        res.status,
        body.error?.message ?? `Erro HTTP ${res.status} no Google Drive.`
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
