import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";
import { nameKey } from "./nameKey";

/**
 * Ação a tomar agora por uma reunião rastreada.
 *
 * `start` e `end` são prompts ao usuário. `attach` não é prompt: é o
 * reconhecimento de que a tarefa que já está rodando **é** esta reunião,
 * iniciada por fora do prompt (Play na planejada, omnibox, digitação).
 */
export type MeetingPromptAction =
  | { kind: "start"; meeting: TrackedMeeting }
  | { kind: "end"; meeting: TrackedMeeting }
  | { kind: "attach"; meeting: TrackedMeeting; taskId: string };

/**
 * Tarefa em execução, do ponto de vista do rastreamento. O `plannedTaskId` não
 * vive na `Task` — vem do `RunningTaskContext`, que guarda de qual planejada a
 * execução partiu.
 *
 * Pausada conta como em execução, de propósito: pausar no meio de uma reunião é
 * corriqueiro, e perguntar "quer iniciar?" sobre a tarefa que está ali só faria
 * o "sim" parar e recriar a mesma coisa. O prompt de fim segue valendo.
 */
export interface RunningTaskSnapshot {
  id: string;
  name: string | null;
  plannedTaskId: string | null;
  /** Início da tarefa (ISO) — usado para não anexar por nome uma tarefa antiga. */
  startTimeISO: string;
}

export interface MeetingPromptOptions {
  /**
   * Tarefa em execução agora, se houver. É o que permite reconhecer a reunião
   * iniciada à mão: sem isso, o rastreamento só sabia da reunião iniciada pelo
   * próprio prompt, e reoferecia o início a cada cadência até o fim do evento.
   */
  runningTask?: RunningTaskSnapshot | null;
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
  /**
   * Intervalo (ms) para re-perguntar o início após "Adiar" (ou se ignorado),
   * enquanto dentro da janela do evento. Se omitido, o prompt de início é único.
   */
  startRepromptMs?: number;
  /** Intervalo (ms) para re-perguntar se a reunião ainda está em andamento. Padrão: 15 min. */
  endRepromptMs?: number;
}

const DEFAULT_END_REPROMPT_MS = 15 * 60 * 1000;

/**
 * Decide, de forma pura, o que fazer agora dado o estado das reuniões
 * rastreadas. Sem side-effects — a orquestração (exibir prompt, iniciar/parar
 * tarefa, persistir estado) fica na camada de apresentação.
 *
 * Regras:
 * - **Anexar** (`attach`): a tarefa em execução é esta reunião, iniciada por
 *   fora do prompt. Substitui o prompt de início — perguntar "quer iniciar?"
 *   sobre o que já está rodando é o bug que esta ação corrige — e é o que
 *   habilita o prompt de fim para quem iniciou à mão.
 * - **Início**: dentro da janela do evento, enquanto a reunião não foi iniciada
 *   nem dispensada. Sem `startRepromptMs` é único; com ele, re-pergunta nessa
 *   cadência (ex.: "Adiar por 5 min"). "Dispensar" grava `startDismissed` e encerra.
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

    // Prompt de início: dentro da janela do evento (com antecedência opcional).
    // "Dispensar" (startDismissed) encerra de vez; "Adiar" reapresenta após startRepromptMs.
    if (m.startDismissed) continue;

    // Um par de limites só, usado pelo "estou na janela agora?" e pelo "a tarefa
    // começou na janela?": calculados em separado, um teto divergiria do outro
    // quando startPromptGraceMs entrasse em uso.
    const windowStart = start - (options.startLeadMs ?? 0);
    const windowEnd =
      options.startPromptGraceMs !== undefined ? start + options.startPromptGraceMs : end;
    const withinWindow = now >= windowStart && (windowEnd === null || now <= windowEnd);
    if (!withinWindow) continue;

    // Anexar vem antes da cadência de re-pergunta, de propósito: barrar por
    // "perguntei há pouco" adiaria o reconhecimento até a cadência vencer, e é
    // exatamente nesse intervalo que o prompt indevido dispararia.
    const attachable = matchesRunningTask(m, options.runningTask, windowStart, windowEnd);
    if (attachable) {
      actions.push({ kind: "attach", meeting: m, taskId: attachable });
      continue;
    }

    const promptedTooRecently =
      m.startPromptedAt !== null &&
      (options.startRepromptMs === undefined ||
        now - new Date(m.startPromptedAt).getTime() < options.startRepromptMs);
    if (promptedTooRecently) continue;

    actions.push({ kind: "start", meeting: m });
  }

  return actions;
}

/**
 * Devolve o id da tarefa em execução quando ela é, de fato, esta reunião — ou
 * null. Dois sinais, nessa ordem:
 *
 * 1. **Vínculo com a planejada**: a execução partiu da planejada que o sync criou
 *    ou adotou para a reunião. É o sinal forte, e cobre todo Play em planejada —
 *    inclusive a adotada do Monday, que carrega o Project Stage.
 * 2. **Nome exato** (case-insensitive, trim): cobre omnibox e digitação livre,
 *    onde não há vínculo nenhum a consultar.
 *
 * O casamento por nome é **exato de propósito**, pela mesma razão da adoção de
 * planejadas: aproximado penduraria a reunião na tarefa errada em silêncio, e
 * anexar errado cala o prompt de início e para a tarefa alheia no prompt de fim.
 *
 * **Só o caminho do nome exige que a tarefa tenha começado dentro da janela.**
 * O chamador já garante que *agora* está na janela, e isso não basta para o nome:
 * uma "Daily" iniciada às 8h e ainda rodando às 10h passaria por essa checagem
 * sem ser a Daily das 10h — anexá-la calaria o prompt de início e, ao parar essa
 * tarefa, marcaria a reunião como encerrada, matando os dois prompts do dia. O
 * vínculo com a planejada não precisa da guarda: é a planejada *daquela* reunião,
 * então tê-la iniciado adiantado é escolha do usuário, não colisão de nomes.
 */
function matchesRunningTask(
  meeting: TrackedMeeting,
  running: RunningTaskSnapshot | null | undefined,
  windowStart: number,
  windowEnd: number | null
): string | null {
  if (!running) return null;
  if (running.plannedTaskId !== null && running.plannedTaskId === meeting.plannedTaskId) {
    return running.id;
  }
  const name = running.name ? nameKey(running.name) : "";
  if (!name || name !== nameKey(meeting.title)) return null;

  const startedAt = new Date(running.startTimeISO).getTime();
  const startedInWindow =
    startedAt >= windowStart && (windowEnd === null || startedAt <= windowEnd);
  return startedInWindow ? running.id : null;
}
