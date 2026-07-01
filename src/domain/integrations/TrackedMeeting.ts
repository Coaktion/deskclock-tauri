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
