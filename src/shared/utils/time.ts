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

/**
 * A faixa de horário da coluna de 88px da linha de tarefa — `09:12–11:00`, com
 * meia-quadratim e sem espaço, como o design a escreve. Sem fim registrado ela
 * é só o começo: a tarefa em aberto não tem faixa, e escrever `09:12–—` põe um
 * travessão onde o leitor espera uma hora.
 */
export function formatTimeRange(startISO: string, endISO: string | null): string {
  const start = formatTimeOfDay(startISO);
  return endISO ? `${start}–${formatTimeOfDay(endISO)}` : start;
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Data local (AAAA-MM-DD) de um timestamp ISO — a data de referência de uma tarefa é a data local do startTime (§6.6) */
export function localDateISO(isoString: string): string {
  const d = new Date(isoString);
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

/**
 * Instante ISO de um "HH:MM" **local** num dia "AAAA-MM-DD".
 *
 * Existia copiado no `RetroactivePage` e no `useRetroactiveForm`, e o lançamento
 * de planejada com horário precisa da terceira cópia — a hora do evento é local
 * (§6.6), então montar o instante pelo UTC jogaria a tarefa para o dia vizinho
 * em boa parte dos fusos.
 */
export function buildLocalISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
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
  if (diff < 0) diff += 1440;
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

/**
 * Hora de fim HH:MM a exibir na edição de uma tarefa já registrada: **a duração
 * gravada manda sobre o instante da parada**. Os dois divergem sempre que a
 * regra de arredondamento agiu (ela reescreve só `durationSeconds`, deixando o
 * `endTime` real) e também quando a tarefa passou por pausas (o `stopTask` soma
 * os trechos rodados, não o intervalo). É a duração gravada que as listas, os
 * totalizadores e as exportações exibem — derivar o fim do intervalo mostrava no
 * modal um valor que o resto do app não mostra em lugar nenhum, e salvar sem
 * tocar em nada regravava esse valor por cima, desfazendo o arredondamento em
 * silêncio.
 *
 * O `endTime` só entra como reserva, para o registro sem duração gravada.
 */
export function resolveRegisteredEndHHMM(
  startHHMM: string,
  durationSeconds: number | null | undefined,
  endHHMM: string | null
): string {
  if (durationSeconds != null && durationSeconds > 0) {
    return computeEndHHMM(startHHMM, durationSeconds);
  }
  return endHHMM ?? startHHMM;
}

/** Formata timestamp ISO de último envio para exibição "DD/MM às HH:MM" */
// Interpreta "HH:MM" como horário local do dia de refISO, clampando para now se futuro.
// Retorna null se o input for inválido.
export function parseStartTimeInput(timeStr: string, refISO: string): string | null {
  const [hh, mm] = timeStr.split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return null;
  const base = new Date(refISO);
  base.setHours(hh, mm, 0, 0);
  return (base > new Date() ? new Date() : base).toISOString();
}

export function formatLastSync(ts: string): string {
  if (!ts) return "Nunca";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} às ${h}:${m}`;
}
