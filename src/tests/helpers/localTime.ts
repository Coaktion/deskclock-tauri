/**
 * Instante ISO montado a partir de componentes **locais**.
 *
 * Boa parte da lógica de data do app raciocina em dia local (§6.6): o dia de uma
 * tarefa é o do `startTime` no fuso do usuário, o agrupamento por dia parte daí
 * e as colunas de data do Monday levam esse dia. Fixar o instante como literal
 * UTC (`"2026-07-30T12:00:00.000Z"`) faz a asserção passar ou falhar conforme o
 * fuso da máquina que roda a suíte: 12:00Z é dia 30 em São Paulo e dia 31 em
 * Auckland.
 *
 * Escrevendo o horário local, o teste diz o que quer dizer — "meio-dia do dia
 * 30 para quem trabalhou" — e vale em qualquer fuso.
 *
 * O mês é 1-based, ao contrário do construtor do `Date`: o call site fica
 * legível e ninguém precisa lembrar do −1 ao ler a data esperada.
 */
export function localISO(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0
): string {
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}
