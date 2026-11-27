import { isDevDatabase } from "@infra/database/db";
import {
  BACKUP_FOLDER_NAME,
  DRIVE_RECONNECT_MESSAGE,
  backupFolderName,
} from "@infra/integrations/googledrive/GoogleDriveClient";
import type { IntegrationFactories } from "@presentation/contexts/IntegrationsContext";
import type { BackupFrequency, ConfigContextValue } from "@shared/types/appConfig";

// O backup no Drive como a subseção "Backup do banco" do card do Google o
// mostra e o roda, fora do componente para a API local ler o estado e fazer o
// backup agora (`docs-internal/specs/mcp.md` §7, Fase D2). Restaurar não tem UI
// (`docs-internal/telas/dados.md`) e não entra aqui.

/** Frase da API: na tela a subseção fica apagada sem o Google conectado. */
export const GOOGLE_DRIVE_NOT_CONNECTED =
  "Google não conectado. Conecte o Google em Integrações para fazer backup no Drive.";

/**
 * O 403 do escopo faltante é o único erro com saída conhecida, e a saída não é
 * "tentar de novo": é reconectar o Google.
 */
export function driveBackupNeedsReconnect(lastError: string): boolean {
  return lastError === DRIVE_RECONNECT_MESSAGE;
}

export interface DriveBackupStatus {
  connected: boolean;
  enabled: boolean;
  frequency: BackupFrequency;
  /** Instante do último backup que subiu, ISO; `null` = nunca. */
  lastRunAt: string | null;
  /** A falha mais recente (botão ou agendador), já pronta para a tela; `null` sem falha. */
  lastError: string | null;
  needsReconnect: boolean;
  folderName: string;
}

export interface DriveBackupSource {
  notConfiguredMessage: string | null;
  status(): Promise<DriveBackupStatus>;
  /** O "Fazer backup agora": lança com a mensagem já gravada em `driveBackupLastError`. */
  run(): Promise<string>;
}

export async function resolveFolderName(): Promise<string> {
  try {
    return backupFolderName(await isDevDatabase());
  } catch {
    // Só o nome exibido depende disto; o backup resolve a pasta por conta própria.
    return BACKUP_FOLDER_NAME;
  }
}

export function buildDriveBackupSource(
  config: ConfigContextValue,
  factories: Pick<IntegrationFactories, "createDriveBackupRunner">
): DriveBackupSource {
  const connected = config.isLoaded && !!config.get("googleRefreshToken");
  return {
    notConfiguredMessage: connected ? null : GOOGLE_DRIVE_NOT_CONNECTED,
    // Lê a config na hora: o runner grava carimbo e erro no mesmo cache.
    status: async () => {
      const lastRunAt = config.get("driveBackupLastRunAt");
      const lastError = config.get("driveBackupLastError");
      return {
        connected,
        enabled: config.get("driveBackupEnabled"),
        frequency: config.get("driveBackupFrequency"),
        lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
        lastError: lastError || null,
        needsReconnect: driveBackupNeedsReconnect(lastError),
        folderName: await resolveFolderName(),
      };
    },
    run: () => factories.createDriveBackupRunner().run(),
  };
}
