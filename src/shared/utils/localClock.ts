const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export interface LocalClock {
  date: string;
  weekday: string;
  utcOffset: string;
}

/** `getTimezoneOffset` (minutos a oeste de UTC, sinal invertido) → `-03:00`. */
export function formatUtcOffset(minutesWestOfUtc: number): string {
  const east = -minutesWestOfUtc;
  const abs = Math.abs(east);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${east < 0 ? "-" : "+"}${hh}:${mm}`;
}

/**
 * Dia local para quem não sabe que dia é hoje (o modelo do MCP resolve "ontem"
 * e "esta semana" a partir daqui). Dia da semana em inglês por ser consumido
 * por máquina. Recebe a data e o instante do mesmo retrato que calculou os
 * totais de hoje, senão os dois podem discordar perto da meia-noite.
 */
export function localClock(dateISO: string, nowISO: string): LocalClock {
  // Meio-dia UTC: o dia da semana da data não depende do fuso de quem roda.
  const weekday = WEEKDAYS[new Date(`${dateISO}T12:00:00Z`).getUTCDay()];
  return {
    date: dateISO,
    weekday,
    utcOffset: formatUtcOffset(new Date(nowISO).getTimezoneOffset()),
  };
}
