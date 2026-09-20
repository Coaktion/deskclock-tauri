/** Um dia oferecido pela recorrência da tarefa planejada. */
export interface WeekdayOption {
  /**
   * O dia como o `Date` o entende (0=Dom … 6=Sáb) — e **nunca** o índice do
   * array: `recurringDays` tem valores gravados nessa escala, e reindexar
   * mudaria o dia de toda tarefa recorrente já salva.
   */
  value: number;
  /** Rótulo curto, o que aparece na pílula. */
  label: string;
  /** Nome por extenso, para o `title`. */
  title: string;
}

/**
 * A semana como a recorrência a oferece: segunda a sexta, e o fim de semana
 * **no fim**.
 *
 * A ordem começa na segunda e **não** segue a config `weekStartsOn`, pelo mesmo
 * motivo que a semana do import da Agenda não a segue: ligar o fim de semana
 * acrescenta sábado e domingo à lista que já existia, e não a reordena. Quem
 * marcava "Seg, Qua, Sex" continua encontrando os três onde estavam.
 *
 * O `value` é a escala do `Date`, então a lista não está em ordem crescente —
 * domingo é 0 e fecha a fila.
 */
const ALL_WEEKDAYS: WeekdayOption[] = [
  { value: 1, label: "Seg", title: "Segunda" },
  { value: 2, label: "Ter", title: "Terça" },
  { value: 3, label: "Qua", title: "Quarta" },
  { value: 4, label: "Qui", title: "Quinta" },
  { value: 5, label: "Sex", title: "Sexta" },
  { value: 6, label: "Sáb", title: "Sábado" },
  { value: 0, label: "Dom", title: "Domingo" },
];

/**
 * Os dias que a recorrência oferece. É a fonte única dos quatro editores de
 * tarefa planejada: com a lista copiada, ligar o fim de semana num deixaria os
 * outros três oferecendo cinco dias em silêncio.
 */
export function weekdayOptions(showWeekend: boolean): WeekdayOption[] {
  return showWeekend ? ALL_WEEKDAYS : ALL_WEEKDAYS.filter((d) => !isWeekendDay(d.value));
}

/** Só os números, para quem filtra `recurringDays` sem desenhar pílula. */
export function weekdayValues(showWeekend: boolean): number[] {
  return weekdayOptions(showWeekend).map((d) => d.value);
}

/**
 * Quantos dias **corridos** a semana cobre a partir da segunda: 5 ou 7.
 *
 * Não é `weekdayValues(...).length` por acidente de igualdade. Aquilo conta
 * opções oferecidas, e as duas contas só coincidem enquanto a lista for
 * contígua a partir da segunda — uma semana futura de "Seg/Qua/Sex" daria três
 * dias corridos em silêncio, terminando na quarta.
 */
export function weekSpan(showWeekend: boolean): number {
  return showWeekend ? 7 : 5;
}

/** Sábado e domingo na escala do `Date`. */
export function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}
