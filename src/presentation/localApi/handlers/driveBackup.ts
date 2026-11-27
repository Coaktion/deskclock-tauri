import { errorResult } from "../errors";
import { assertConfigured } from "../importInput";
import type { LocalApiHandler } from "../types";

// O backup no Drive pela API local (`mcp.md` §7, Fase D2): o estado que a
// subseção "Backup do banco" mostra e o "Fazer backup agora". Restaurar não tem
// UI — é procedimento manual, com o app fechado (`docs-internal/telas/dados.md`).

export const getDriveBackupStatus: LocalApiHandler = async (deps) => ({
  status: 200,
  body: await deps.driveBackup().status(),
});

export const runDriveBackup: LocalApiHandler = async (deps) => {
  const source = deps.driveBackup();
  assertConfigured(source);
  try {
    const fileId = await source.run();
    return { status: 200, body: { fileId, status: await source.status() } };
  } catch (error) {
    // O runner já gravou a mensagem pronta para a tela em `driveBackupLastError`,
    // como no botão; a falha é do Google, não do pedido — 502.
    return errorResult(502, error instanceof Error ? error.message : String(error));
  }
};
