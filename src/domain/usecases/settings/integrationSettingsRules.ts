import type { BackupFrequency } from "@shared/types/appConfig";
import { DEFAULT_COLUMN_MAPPING, type SheetColumnMapping } from "@shared/types/sheetsConfig";

/**
 * As opções e as normalizações dos ajustes de integração que a tela de
 * Integrações oferece, num lugar só: a tela e a API local gravam com as mesmas
 * regras (`docs-internal/specs/mcp.md` §7, Fase D3b).
 */

/** Aba da planilha quando o campo fica em branco — o que o blur da tela grava. */
export const DEFAULT_SHEET_NAME = "DeskClock";

export function normalizeSheetName(name: string): string {
  return name.trim() || DEFAULT_SHEET_NAME;
}

export const SHEETS_DURATION_FORMATS = ["HH:MM", "HH:MM:SS"] as const;

export const AUTO_SYNC_MODES = ["per-task", "daily"] as const;
export const AUTO_SYNC_TRIGGERS = ["on-open", "fixed-time"] as const;

export const BACKUP_FREQUENCIES: readonly BackupFrequency[] = ["daily", "weekly", "monthly"];

/** O `HH:MM` que o `<input type="time">` da tela produz. */
export function isTimeOfDay(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Mapeamento de colunas da planilha: os oito campos, cada um uma vez, na ordem
 * das colunas. A tela só reordena, liga/desliga e renomeia — nunca acrescenta
 * nem tira campo —, então a lista inteira é o único formato que expressa a
 * ordem.
 */
export function isSheetColumnMapping(value: unknown): value is SheetColumnMapping {
  if (!Array.isArray(value) || value.length !== DEFAULT_COLUMN_MAPPING.length) return false;
  const expected = new Set<string>(DEFAULT_COLUMN_MAPPING.map((c) => c.field));
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const { field, label, enabled } = item as Record<string, unknown>;
    if (typeof field !== "string" || !expected.has(field) || seen.has(field)) return false;
    if (typeof label !== "string" || typeof enabled !== "boolean") return false;
    seen.add(field);
  }
  return true;
}
