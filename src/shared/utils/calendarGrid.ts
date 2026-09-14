/**
 * A grade de um mês e as conversões de data que o calendário precisa.
 *
 * **Tudo entra e sai em ISO (`AAAA-MM-DD`) ou em números de ano/mês** — nunca em
 * `Date`. Não é preciosismo: `new Date("2026-09-05")` é meia-noite **UTC**, que
 * em São Paulo é dia 4, e foi assim que o `isoToDate` do picker antigo precisou
 * quebrar a string à mão para não errar o dia. Mantendo a fronteira em string, o
 * fuso não tem por onde entrar, e o teste não depende da máquina que o roda
 * (§7.6 de `testes.md`).
 *
 * A semana começa na **segunda**, como o `weekBoundsISO` de `time.ts` já assume
 * — o app inteiro conta semana assim, e um calendário domingo-primeiro faria a
 * coluna do fim de semana cair em lugar diferente do resto das telas.
 */

/** Iniciais de segunda a domingo. Uma letra porque a célula tem 32px. */
export const WEEKDAY_INITIALS = ["S", "T", "Q", "Q", "S", "S", "D"] as const;

/** Nome do dia por extenso, para o `aria-label` da célula. */
export const WEEKDAY_NAMES = [
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
  "domingo",
] as const;

export const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

/** A grade de meses tem 4 colunas de 56px: o nome por extenso não cabe. */
export const MONTH_ABBR = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
] as const;

/** Quantos anos a vista de anos mostra, e quantos deles ficam antes do atual. */
export const YEAR_PAGE_SIZE = 12;
const YEARS_BEFORE = 6;

export interface CalendarCell {
  /** `AAAA-MM-DD`. */
  iso: string;
  /** O número que a célula escreve. */
  day: number;
  /** Dia de outro mês, ocupando a borda da grade. */
  outside: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** ISO local de um `Date` — pelo calendário do relógio, nunca por `toISOString`. */
export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * `Date` local à meia-noite, ou `null` se a string não for uma data ISO válida.
 *
 * Valida por ida e volta: `2026-02-31` constrói um `Date` (que rola para 3 de
 * março) e só o retorno mostra que a entrada não existia.
 */
export function fromISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return toISODate(date) === iso ? date : null;
}

/** O primeiro dia do mês de uma data ISO — o mês que a vista abre. */
export function monthOf(iso: string): { year: number; month: number } | null {
  const date = fromISODate(iso);
  return date ? { year: date.getFullYear(), month: date.getMonth() } : null;
}

/**
 * As 42 células do mês: seis semanas de segunda a domingo.
 *
 * **São sempre 42, mesmo quando o mês cabe em cinco semanas.** Um número
 * variável faria o popover mudar de altura ao navegar entre meses, e o painel
 * está ancorado num campo — encolher significa descolar da borda que o abriu.
 *
 * `month` é 0–11, como no `Date`, e valores fora disso rolam para o ano vizinho
 * (mês 12 é janeiro do ano seguinte). É o que deixa a navegação ser
 * `monthCells(ano, mes + 1)` sem tratar a virada do ano em quem chama.
 */
export function monthCells(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  // `getDay()` é 0 no domingo; com a semana na segunda, o domingo é o 6º passo.
  const offset = (first.getDay() + 6) % 7;
  const normalizedMonth = first.getMonth();

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - offset + i);
    return {
      iso: toISODate(date),
      day: date.getDate(),
      outside: date.getMonth() !== normalizedMonth,
    };
  });
}

/** Os 12 anos que a vista de anos mostra, com `year` no sétimo lugar. */
export function yearPage(year: number): number[] {
  const base = year - YEARS_BEFORE;
  return Array.from({ length: YEAR_PAGE_SIZE }, (_, i) => base + i);
}

/** `2026-09-05` → `05/09/2026`. Vazio devolve vazio: é o campo sem valor. */
export function formatBrDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

/**
 * `05/09/2026` → `2026-09-05`, ou `null` enquanto não for uma data completa e
 * existente. **`31/02/2026` devolve `null`** — quem digita não vê o campo
 * corrigir sozinho para 3 de março, que é o que a construção crua faria.
 */
export function parseBrDate(text: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const [, d, m, y] = match;
  const iso = `${y}-${m}-${d}`;
  return fromISODate(iso) ? iso : null;
}

/**
 * A máscara da digitação: só dígitos, barras postas por conta.
 *
 * Não valida nada — quem valida é o `parseBrDate`, e só quando os 8 dígitos
 * estão lá. Rejeitar cedo impediria de escrever `05/09/2026`, cujo prefixo
 * `05/0` não é data nenhuma.
 */
export function maskBrDate(text: string): string {
  const digits = text.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
