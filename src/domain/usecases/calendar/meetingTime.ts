/**
 * Compõe um ISO datetime absoluto a partir de uma data local "YYYY-MM-DD" e um
 * horário "HH:MM". O horário é interpretado no fuso local do usuário (§6.6) —
 * `new Date("YYYY-MM-DDTHH:MM:00")` sem sufixo Z usa o fuso local, e
 * `.toISOString()` converte para o instante UTC correspondente.
 */
export function composeLocalISO(dateISO: string, hhmm: string): string {
  return new Date(`${dateISO}T${hhmm}:00`).toISOString();
}

/**
 * Fim absoluto de uma reunião. Se o horário de término for menor ou igual ao de
 * início, considera-se que cruzou a meia-noite e o fim vai para o dia seguinte.
 */
export function composeMeetingEndISO(dateISO: string, startHHMM: string, endHHMM: string): string {
  const startISO = composeLocalISO(dateISO, startHHMM);
  const endISO = composeLocalISO(dateISO, endHHMM);
  if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
    return new Date(new Date(endISO).getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  return endISO;
}
