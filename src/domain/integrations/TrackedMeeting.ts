/**
 * Registro de rastreamento de uma reunião do Google Agenda para início/fim
 * automático de tarefas. Vive na fronteira da integração de calendário
 * (como {@link CalendarEvent}) — deliberadamente fora de `domain/entities/`
 * para não acoplar as entidades núcleo (Task/PlannedTask) a nenhuma integração.
 */
export interface TrackedMeeting {
  /** ID do evento no Google Agenda — identidade estável para dedup entre polls. */
  calendarEventId: string;
  /** Data local do evento "YYYY-MM-DD" (usada para poda diária). */
  date: string;
  /** Título do evento, exibido no prompt. */
  title: string;
  /** Início do evento como ISO datetime no fuso local. */
  startISO: string;
  /** Fim do evento como ISO datetime no fuso local — null se indeterminado. */
  endISO: string | null;
  /** ID da Task iniciada para esta reunião, ou null se ainda não iniciada. */
  startedTaskId: string | null;
  /**
   * PlannedTask que representa esta reunião no planejamento — criada por ela ou
   * já existente (inclusive importada do Monday) e adotada.
   *
   * `null` significa **ainda não tratada**, e é o que faz o sync tentar de novo
   * no ciclo seguinte: sem este campo, "já virou planejada?" era respondido
   * comparando nomes, e o rastreamento marcava o evento como visto antes de a
   * criação acontecer — uma falha ali sumia com a planejada para sempre.
   *
   * Preenchida significa **tratada**, e continua assim mesmo que a planejada
   * seja apagada depois: planejada apagada à mão não volta.
   */
  plannedTaskId: string | null;
  /** Momento em que o prompt de início foi exibido (ISO), ou null. Prompt de início é único. */
  startPromptedAt: string | null;
  /** true se o usuário optou por não iniciar esta reunião. */
  startDismissed: boolean;
  /** Quantas vezes o prompt de fim já foi exibido (para cadência de re-pergunta). */
  endPromptCount: number;
  /** Momento do último prompt de fim (ISO), ou null. */
  lastEndPromptAt: string | null;
  /** true quando a reunião foi encerrada (tarefa parada) — não gera mais prompts. */
  ended: boolean;
}
