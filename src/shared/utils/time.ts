export function formatHHMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Compact MM:SS display for small overlays (minutes can exceed 59). */
export function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function formatDurationCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

export function formatWeekTotal(totalSeconds: number, days: number): string {
  return `${formatHHMMSS(totalSeconds)} ${days}d`;
}

export function formatTimeOfDay(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function weekBoundsISO(): { start: string; end: string } {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const diffToMon = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  };
  return { start: fmt(mon), end: fmt(sun) };
}

export function formatHHMM(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const DAY_SHORT_PT = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
const MONTH_SHORT_PT = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];

export function formatHistoryDayHeader(dateISO: string): string {
  const d = new Date(dateISO + "T12:00:00Z");
  const dow = DAY_SHORT_PT[d.getUTCDay()];
  const day = d.getUTCDate();
  const month = MONTH_SHORT_PT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${dow} ${day} de ${month} de ${year}`;
}

export function startOfDayISO(dateISO: string): string {
  return new Date(dateISO + "T00:00:00").toISOString();
}

export function endOfDayISO(dateISO: string): string {
  return new Date(dateISO + "T23:59:59.999").toISOString();
}

export function addDaysISO(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function parseDurationInput(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // HH:MM:SS
  const hms = trimmed.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hms) return Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
  // HH:MM
  const hm = trimmed.match(/^(\d+):(\d{2})$/);
  if (hm) return Number(hm[1]) * 3600 + Number(hm[2]) * 60;
  // Linguagem natural: "1h", "1h 2", "1h 2m", "1h 30min", "0h 20m", "2h 30min"
  const natural = trimmed.match(/^(\d+)\s*h(?:\s*(\d+)\s*(?:m(?:in)?)?)?$/i);
  if (natural) return Number(natural[1]) * 3600 + Number(natural[2] ?? 0) * 60;
  // Apenas minutos com sufixo: "20m", "30min"
  const minsuffix = trimmed.match(/^(\d+)\s*m(?:in)?$/i);
  if (minsuffix) return Number(minsuffix[1]) * 60;
  // inteiro = minutos
  const mins = trimmed.match(/^\d+$/);
  if (mins) return Number(mins[0]) * 60;
  return null;
}

/** Calcula duração HH:MM entre dois horários HH:MM; trata overnight automaticamente */
export function computeDurationHHMM(start: string, end: string): string {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((v) => !isFinite(v))) return "00:01";
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 1440;
  return `${String(Math.floor(diff / 60)).padStart(2, "0")}:${String(diff % 60).padStart(2, "0")}`;
}

/** Calcula hora fim HH:MM a partir de hora início HH:MM e duração em segundos */
export function computeEndHHMM(start: string, durationSeconds: number): string {
  const [sh, sm] = start.split(":").map(Number);
  if (!isFinite(sh) || !isFinite(sm) || !isFinite(durationSeconds)) return start;
  const totalMins = sh * 60 + sm + Math.round(durationSeconds / 60);
  const endMins = ((totalMins % 1440) + 1440) % 1440;
  return `${String(Math.floor(endMins / 60)).padStart(2, "0")}:${String(endMins % 60).padStart(2, "0")}`;
}
