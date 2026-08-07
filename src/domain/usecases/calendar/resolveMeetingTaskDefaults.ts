import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { nameKey } from "./nameKey";

/** Campos que a tarefa da reunião herda da planejada de origem. */
export interface MeetingTaskDefaults {
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  /** Planejada de origem da execução, ou `null` quando a tarefa nasce solta. */
  plannedTaskId: string | null;
}

export interface ResolveMeetingTaskDefaultsInput {
  /** Título do evento — a chave do casamento por nome, quando ele for preciso. */
  title: string;
  /** Vínculo gravado pelo sync em `calendar_tracked_meetings`, se houver. */
  plannedTaskId: string | null;
  /** Data local "YYYY-MM-DD" de hoje. */
  todayISO: string;
  /** Workspace em que a tarefa vai nascer — o ativo (§5.7). */
  workspaceId: string;
}

const NOTHING: MeetingTaskDefaults = {
  projectId: null,
  categoryId: null,
  billable: false,
  plannedTaskId: null,
};

const fromPlanned = (p: PlannedTask): MeetingTaskDefaults => ({
  projectId: p.projectId,
  categoryId: p.categoryId,
  billable: p.billable,
  plannedTaskId: p.id,
});

/**
 * Decide com que projeto, categoria e vínculo a tarefa de uma reunião começa.
 *
 * **O vínculo manda, mas só dentro do workspace em que a tarefa vai nascer.** O
 * rastreamento de reuniões é global (`calendar_tracked_meetings` não tem
 * workspace), enquanto a planejada é escopada: quem decide qual planejada a
 * reunião adota é o ciclo de sync, com o workspace que estava ativo *naquele
 * instante* — em geral logo depois da meia-noite, horas antes de o alerta tocar.
 * Trocar de workspace no meio do dia bastava para o vínculo apontar para a cópia
 * do outro workspace, e colar aqui o `projectId` dela produzia uma tarefa com um
 * id que **não existe** no catálogo ativo: projeto e categoria são únicos por
 * workspace (§4.3), então a tela não acha o nome e o campo aparece **em branco**,
 * exatamente como se nada tivesse sido copiado.
 *
 * Fora do workspace, o vínculo cai para o **casamento por nome exato dentro do
 * workspace ativo** — que era o caminho principal antes de o vínculo existir. Ele
 * volta como rede: numa conta que tem a mesma reunião planejada nos dois
 * workspaces, é justamente a cópia local que o usuário vê na lista do popup e
 * espera que o alerta use. Exato pela mesma razão da adoção de planejadas (§5.7):
 * aproximado penduraria a reunião no trabalho errado sem ninguém conferindo.
 *
 * Não achando nada, devolve tudo vazio — inclusive `plannedTaskId`. Gravar na
 * tarefa um vínculo de outro workspace só levaria o problema adiante: quem parasse
 * a tarefa concluiria a planejada alheia.
 *
 * A segunda consulta só acontece quando o vínculo falha, que é o caso raro.
 */
export async function resolveMeetingTaskDefaults(
  plannedRepo: IPlannedTaskRepository,
  input: ResolveMeetingTaskDefaultsInput
): Promise<MeetingTaskDefaults> {
  const linked = input.plannedTaskId ? await plannedRepo.findById(input.plannedTaskId) : null;
  if (linked && linked.workspaceId === input.workspaceId) return fromPlanned(linked);

  const key = nameKey(input.title);
  const sameDay = await plannedRepo.findForDate(input.todayISO, input.workspaceId);
  const match = sameDay.find((p) => nameKey(p.name) === key);
  return match ? fromPlanned(match) : NOTHING;
}
