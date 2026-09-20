import type { WeekStart } from "@shared/types/appConfig";

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

/** A semana de domingo a sábado, na ordem do `Date`. A rotação sai daqui. */
const SUNDAY_FIRST: WeekdayOption[] = [
  { value: 0, label: "Dom", title: "Domingo" },
  { value: 1, label: "Seg", title: "Segunda" },
  { value: 2, label: "Ter", title: "Terça" },
  { value: 3, label: "Qua", title: "Quarta" },
  { value: 4, label: "Qui", title: "Quinta" },
  { value: 5, label: "Sex", title: "Sexta" },
  { value: 6, label: "Sáb", title: "Sábado" },
];

/**
 * Os dias que a recorrência oferece, **na ordem que o usuário escolheu** para o
 * começo da semana.
 *
 * É a fonte única dos quatro editores de tarefa planejada: com a lista copiada,
 * ligar o fim de semana num deixaria os outros três oferecendo cinco dias em
 * silêncio.
 *
 * A ordem segue `weekStartsOn` porque é a mesma semana que as pílulas do
 * Planejamento desenham — duas ordens na mesma tela fariam a lista de dias
 * parecer duas semanas diferentes. Com o fim de semana desligado a config não
 * muda nada: rodar a lista e depois tirar sábado e domingo devolve segunda a
 * sexta nos dois modos.
 *
 * O `value` é a escala do `Date`, então a lista não sai em ordem crescente.
 */
export function weekdayOptions(showWeekend: boolean, weekStartsOn: WeekStart): WeekdayOption[] {
  const rotated = SUNDAY_FIRST.map((_, i) => SUNDAY_FIRST[(i + weekStartsOn) % 7]);
  return showWeekend ? rotated : rotated.filter((d) => !isWeekendDay(d.value));
}

/** Só os números, para quem filtra `recurringDays` sem desenhar pílula. */
export function weekdayValues(showWeekend: boolean, weekStartsOn: WeekStart): number[] {
  return weekdayOptions(showWeekend, weekStartsOn).map((d) => d.value);
}

/**
 * Quantos dias **corridos** a semana cobre: 5 ou 7.
 *
 * Não é `weekdayValues(...).length` por acidente de igualdade. Aquilo conta
 * opções oferecidas, e as duas contas só coincidem enquanto a lista for
 * contígua — uma semana futura de "Seg/Qua/Sex" daria três dias corridos em
 * silêncio.
 */
export function weekSpan(showWeekend: boolean): number {
  return showWeekend ? 7 : 5;
}

/**
 * Onde a semana **começa de fato** numa tela que pode estar sem fim de semana.
 *
 * Com sábado e domingo escondidos, a semana é de segunda a sexta e a escolha
 * "domingo" não tem o que ordenar: começar num dia que não se vê deixaria a
 * grade abrindo no vazio. Ligado o fim de semana, a escolha passa a valer.
 */
export function effectiveWeekStart(showWeekend: boolean, weekStartsOn: WeekStart): WeekStart {
  return showWeekend ? weekStartsOn : 1;
}

/** Sábado e domingo na escala do `Date`. */
export function isWeekendDay(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}
