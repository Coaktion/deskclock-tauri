import type { BackupFrequency } from "@shared/types/appConfig";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Quanto tempo precisa passar desde o último backup bem-sucedido.
 *
 * "Mensal" são 30 dias corridos, não o mesmo dia do mês seguinte: sem âncora de
 * calendário não existe a borda do dia 31, e o mês de 28 dias não atrasa nada.
 */
export const BACKUP_INTERVAL_MS: Record<BackupFrequency, number> = {
  daily: 24 * HOUR_MS,
  weekly: 7 * 24 * HOUR_MS,
  monthly: 30 * 24 * HOUR_MS,
};

export interface ShouldRunBackupInput {
  enabled: boolean;
  frequency: BackupFrequency;
  /** Instante do último sucesso; `0` = nunca rodou. */
  lastRunAt: number;
  now: number;
}

/**
 * A regra inteira do agendamento — vencimento, não horário marcado.
 *
 * O `useDailySyncScheduler` descarta disparo perdido de propósito, e para envio
 * de horas isso é acerto. Para backup é o defeito: um mensal às 03:00 do dia 1
 * pode nunca acontecer, porque o app raramente está aberto naquele minuto. Aqui
 * o backup vence e roda na primeira oportunidade — ver §2.2 do plano.
 */
export function shouldRunBackup({
  enabled,
  frequency,
  lastRunAt,
  now,
}: ShouldRunBackupInput): boolean {
  if (!enabled) return false;
  // Nunca rodou: vence na primeira oportunidade, sem esperar um ciclo inteiro.
  if (lastRunAt <= 0) return true;
  // Carimbo no futuro só acontece com relógio acertado para trás. Tratar como
  // vencido, e não como "faltam meses", é o que evita o backup parar calado até
  // o relógio alcançar a data errada que ficou gravada.
  if (lastRunAt > now) return true;
  return now - lastRunAt >= BACKUP_INTERVAL_MS[frequency];
}
