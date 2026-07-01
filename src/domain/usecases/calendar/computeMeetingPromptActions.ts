import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";

/** Ação de prompt a ser exibida ao usuário para uma reunião rastreada. */
export type MeetingPromptAction =
  | { kind: "start"; meeting: TrackedMeeting }
  | { kind: "end"; meeting: TrackedMeeting };

export interface MeetingPromptOptions {
  /**
   * Antecedência (ms) com que o prompt de início pode aparecer antes do horário
   * do evento — permite entrar na reunião com a tarefa já rodando. Padrão: 0.
   */
  startLeadMs?: number;
  /**
   * Janela (ms) após o início em que ainda faz sentido perguntar se quer iniciar.
   * Se omitido, usa o fim do evento (endISO) como limite — assim, abrir o app no
   * meio de uma reunião ainda oferece o início.
   */
  startPromptGraceMs?: number;
  /** Intervalo (ms) para re-perguntar se a reunião ainda está em andamento. Padrão: 15 min. */
  endRepromptMs?: number;
}

const DEFAULT_END_REPROMPT_MS = 15 * 60 * 1000;

/**
 * Decide, de forma pura, quais prompts devem ser exibidos agora dado o estado
 * das reuniões rastreadas. Sem side-effects — a orquestração (exibir prompt,
 * iniciar/parar tarefa, persistir estado) fica na camada de apresentação.
 *
 * Regras:
 * - **Início**: uma única vez, quando `now` está dentro da janela do evento e a
 *   reunião ainda não foi iniciada nem dispensada.
 * - **Fim**: quando a reunião foi iniciada como tarefa e o horário de término já
 *   passou; re-pergunta a cada `endRepromptMs` enquanto não for encerrada.
 */
export function computeMeetingPromptActions(
  nowISO: string,
  meetings: TrackedMeeting[],
  options: MeetingPromptOptions = {}
): MeetingPromptAction[] {
  const now = new Date(nowISO).getTime();
  const endRepromptMs = options.endRepromptMs ?? DEFAULT_END_REPROMPT_MS;
  const actions: MeetingPromptAction[] = [];

  for (const m of meetings) {
    if (m.ended) continue;

    const start = new Date(m.startISO).getTime();
    const end = m.endISO ? new Date(m.endISO).getTime() : null;

    // Reunião já iniciada como tarefa: só cabe o prompt de fim.
    if (m.startedTaskId) {
      if (end !== null && now >= end) {
        const due =
          m.endPromptCount === 0 ||
          m.lastEndPromptAt === null ||
          now - new Date(m.lastEndPromptAt).getTime() >= endRepromptMs;
        if (due) actions.push({ kind: "end", meeting: m });
      }
      continue;
    }

    // Prompt de início: único, dentro da janela do evento (com antecedência opcional).
    if (m.startDismissed || m.startPromptedAt !== null) continue;
    const startLeadMs = options.startLeadMs ?? 0;
    const withinWindow =
      now >= start - startLeadMs &&
      (options.startPromptGraceMs !== undefined
        ? now <= start + options.startPromptGraceMs
        : end === null || now <= end);
    if (withinWindow) actions.push({ kind: "start", meeting: m });
  }

  return actions;
}
