import { BACKUP_INTERVAL_MS, shouldRunBackup } from "@domain/usecases/backup/shouldRunBackup";
import type { BackupFrequency } from "@shared/types/appConfig";
import { describe, expect, it } from "vitest";

const NOW = new Date("2026-08-12T14:30:00Z").getTime();

function run(overrides: Partial<Parameters<typeof shouldRunBackup>[0]> = {}) {
  return shouldRunBackup({
    enabled: true,
    frequency: "weekly",
    lastRunAt: NOW,
    now: NOW,
    ...overrides,
  });
}

describe("shouldRunBackup", () => {
  it("não roda com o backup desligado, nem quando nunca rodou", () => {
    expect(run({ enabled: false, lastRunAt: 0 })).toBe(false);
  });

  it("roda na primeira oportunidade quando nunca rodou", () => {
    expect(run({ lastRunAt: 0 })).toBe(true);
  });

  const frequencies: BackupFrequency[] = ["daily", "weekly", "monthly"];

  it.each(frequencies)("vence exatamente no intervalo de %s", (frequency) => {
    const interval = BACKUP_INTERVAL_MS[frequency];
    expect(run({ frequency, lastRunAt: NOW - interval + 1 })).toBe(false);
    expect(run({ frequency, lastRunAt: NOW - interval })).toBe(true);
  });

  it("separa as três frequências: o que venceu no diário ainda não venceu no semanal", () => {
    const lastRunAt = NOW - BACKUP_INTERVAL_MS.daily;
    expect(run({ frequency: "daily", lastRunAt })).toBe(true);
    expect(run({ frequency: "weekly", lastRunAt })).toBe(false);
    expect(run({ frequency: "monthly", lastRunAt })).toBe(false);
  });

  it("trata carimbo no futuro como vencido, e não como meses de espera", () => {
    expect(run({ lastRunAt: NOW + BACKUP_INTERVAL_MS.monthly })).toBe(true);
  });

  it("continua desligado mesmo com o intervalo vencido", () => {
    expect(run({ enabled: false, lastRunAt: NOW - BACKUP_INTERVAL_MS.monthly })).toBe(false);
  });
});
