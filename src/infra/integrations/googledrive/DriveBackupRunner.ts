import { invoke } from "@tauri-apps/api/core";
import type { IDriveBackupPort } from "@domain/integrations/IDriveBackupPort";
import type { IDriveBackupRunner } from "@domain/integrations/IDriveBackupRunner";
import type { IGoogleAuthPort } from "@domain/integrations/IGoogleAuthPort";
import { SECRET_CONFIG_KEYS } from "@shared/constants/secretConfigKeys";
import { isDevDatabase } from "@infra/database/db";
import { GoogleTokenManager } from "../google/GoogleTokenManager";
import { GoogleDriveClient, backupErrorMessage, backupFolderName } from "./GoogleDriveClient";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `deskclock-2026-08-12-1430.db` — hora local, que é a que o usuário reconhece. */
export function backupFileName(when: Date): string {
  const date = `${when.getFullYear()}-${pad2(when.getMonth() + 1)}-${pad2(when.getDate())}`;
  return `deskclock-${date}-${pad2(when.getHours())}${pad2(when.getMinutes())}.db`;
}

/**
 * A execução inteira do backup, do token à poda. É o que a UI e o agendador
 * chamam — nenhum dos dois conhece o Drive nem o comando Rust.
 *
 * É também a única camada que conhece as duas pontas de dev/produção: o cliente
 * do Drive recebe o nome da pasta já resolvido, e não sabe de onde ele veio.
 */
export class DriveBackupRunner implements IDriveBackupRunner {
  private readonly tokenManager: GoogleTokenManager;

  constructor(private readonly config: IDriveBackupPort & IGoogleAuthPort) {
    this.tokenManager = new GoogleTokenManager(config);
  }

  async run(): Promise<string> {
    try {
      const token = await this.tokenManager.getValidAccessToken();
      const client = new GoogleDriveClient(
        token,
        this.config,
        backupFolderName(await isDevDatabase())
      );
      const folderId = await client.ensureBackupFolder();

      const fileId = await invoke<string>("backup_db_to_drive", {
        accessToken: token,
        folderId,
        fileName: backupFileName(new Date()),
        // A lista sai daqui e não do Rust de propósito: é ao lado do `AppConfig`
        // que uma integração nova acrescenta o token dela (ver `secretConfigKeys`).
        secretKeys: [...SECRET_CONFIG_KEYS],
      });

      // O carimbo é o que segura a próxima execução, e só avança com o arquivo
      // no Drive: gravá-lo antes faria a falha adiar o backup por um ciclo
      // inteiro, calada. Pela mesma razão a poda vem **depois** dele.
      await this.config.set("driveBackupLastRunAt", Date.now());
      await this.config.set("driveBackupLastError", "");

      await this.prune(client, folderId);
      return fileId;
    } catch (err) {
      const message = backupErrorMessage(err);
      await this.config.set("driveBackupLastError", message);
      throw new Error(message);
    }
  }

  /**
   * Higiene da pasta, e nada além disso: o erro fica no `console` e não sobe.
   * Solto, ele viraria o `driveBackupLastError` de um backup que já subiu — a
   * tela diria "falhou" sobre o arquivo que está lá, e o usuário reconectaria o
   * Google por nada. Mesmo raciocínio do `removeOrphans` do Monday
   * (`docs/integracoes/README.md`).
   */
  private async prune(client: GoogleDriveClient, folderId: string): Promise<void> {
    try {
      const keep = this.config.get("driveBackupKeepCount");
      // Zero ou negativo é "não podar", nunca "apagar tudo": a leitura literal
      // apagaria, logo depois do upload, o backup recém-criado.
      if (!Number.isFinite(keep) || keep <= 0) return;

      const backups = await client.listBackups(folderId);
      for (const file of backups.slice(keep)) {
        await client.deleteFile(file.id);
      }
    } catch (err) {
      console.warn("[Drive] Falha ao podar backups antigos:", err);
    }
  }
}
