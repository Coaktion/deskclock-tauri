import { useEffect, useRef } from "react";
import { shouldRunBackup } from "@domain/usecases/backup/shouldRunBackup";
import type { IDriveBackupRunner } from "@domain/integrations/IDriveBackupRunner";
import type { ConfigContextValue } from "@shared/types/appConfig";

/**
 * Vencimento, não horário marcado — e por isso este hook **não** copia o
 * `useDailySyncScheduler`.
 *
 * Aquele descarta disparo perdido de propósito (`useDailySyncScheduler.ts`,
 * linhas 76–80): se o app estava fechado no minuto configurado, não roda depois.
 * Para envio de horas é acerto — quem não viu a sync acontecer não fica em
 * dúvida sobre quando ela rodou. Para backup é o defeito: um mensal às 03:00 do
 * dia 1 pode nunca acontecer. Aqui o backup **vence** e roda na primeira
 * oportunidade em que o app estiver aberto. Quem for uniformizar os dois está
 * desfazendo decisão tomada (§2.2 de `docs/specs/backup-google-drive.md`).
 *
 * Só monta na janela principal: `App` é renderizado apenas quando o label da
 * janela não é overlay nem toast (`main.tsx`), e sem isso seriam quatro backups
 * concorrentes sobre o mesmo banco.
 */

const POLL_INTERVAL_MS = 5 * 60_000;

/**
 * Espera imposta depois de uma falha, por cima do vencimento.
 *
 * Sem ela, backup vencido que falha é retentado a cada poll para sempre: o
 * carimbo só avança no sucesso, então `shouldRunBackup` segue verdadeiro. E o
 * caso comum não é o raro — todo mundo que já conectou o Google precisa
 * reconectar para conceder o `drive.file`, e até reconectar toda tentativa
 * volta 403. São 288 tentativas por dia, várias delas arrastando um
 * `VACUUM INTO` do banco inteiro. O botão "Fazer backup agora" da tela não
 * passa por aqui, então quem acabou de reconectar não fica esperando.
 */
const RETRY_COOLDOWN_MS = 30 * 60_000;

export function useDriveBackupScheduler(
  config: ConfigContextValue,
  createRunner: () => IDriveBackupRunner
) {
  const runningRef = useRef(false);
  const retryAfterRef = useRef(0);

  useEffect(() => {
    if (!config.isLoaded) return;

    async function checkAndRun() {
      // Tudo daqui até marcar o ref é síncrono — é o que faz a guarda valer
      // contra o poll que cai em cima de uma execução ainda em voo, e contra o
      // duplo disparo do StrictMode em dev.
      if (runningRef.current) return;

      const now = Date.now();
      if (now < retryAfterRef.current) return;

      const due = shouldRunBackup({
        enabled: config.get("driveBackupEnabled"),
        frequency: config.get("driveBackupFrequency"),
        lastRunAt: config.get("driveBackupLastRunAt"),
        now,
      });
      if (!due) return;

      runningRef.current = true;
      try {
        await createRunner().run();
      } catch {
        // O runner já gravou `driveBackupLastError`, e é de lá que a tela conta
        // o que houve. Toast a cada poll sobre um backup de fundo seria ruído
        // sobre algo que o usuário não pediu agora.
        retryAfterRef.current = Date.now() + RETRY_COOLDOWN_MS;
      } finally {
        runningRef.current = false;
      }
    }

    void checkAndRun();
    const interval = setInterval(() => void checkAndRun(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
