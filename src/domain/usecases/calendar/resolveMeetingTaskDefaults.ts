import type { CustomValues } from "@domain/entities/CustomField";
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
  /**
   * Campos personalizados da planejada — entre eles o **Project Stage**, que o
   * Monday exige no envio das horas (§5.7), e que ficava para trás: o alerta
   * copiava projeto e categoria e parava aí, então a reunião adotada de um item
   * do Monday subia sem a etapa e o preenchimento voltava a ser manual. Também
   * entram na chave de agrupamento (§6.3), como em todo início a partir de uma
   * tarefa existente.
   */
  customValues: CustomValues;
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

/** Função, não constante: devolver o mesmo objeto (e o mesmo `customValues`) a
 *  toda chamada convidaria quem recebe a mutá-lo para todos os outros. */
const nothing = (): MeetingTaskDefaults => ({
  projectId: null,
  categoryId: null,
  billable: false,
  plannedTaskId: null,
  customValues: {},
});

const fromPlanned = (p: PlannedTask): MeetingTaskDefaults => ({
  projectId: p.projectId,
  categoryId: p.categoryId,
  billable: p.billable,
  plannedTaskId: p.id,
  customValues: { ...p.customValues },
});

/**
 * Decide com que projeto, categoria, campos personalizados e vínculo a tarefa de
 * uma reunião começa.
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
  return match ? fromPlanned(match) : nothing();
}
