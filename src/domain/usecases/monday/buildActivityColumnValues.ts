import type { MondayActivityColumnIds } from "@shared/types/mondayConfig";
import { localDateISO } from "@shared/utils/time";

export const MONDAY_BILLABLE_LABEL = "Billable";
export const MONDAY_NON_BILLABLE_LABEL = "Non Billable";
export const MONDAY_COMPLETED_LABEL = "Completed";

export interface BuildActivityColumnValuesInput {
  columnIds: MondayActivityColumnIds;
  /** Horas em decimal, como o Monday espera na coluna "Reported Hours" (ex: 1.83). */
  hoursDecimal: number;
  billable: boolean;
  /** Id numérico do usuário Monday, gravado na coluna `people`. */
  userId: string;
  activityTypeLabel?: string;
  projectStageLabel?: string;
  /** Só entra em hora **não faturável**; ver `buildActivityColumnValues`. */
  nonBillableReasonLabel?: string;
  statusLabel?: string;
}

/** Serializador da coluna `numbers`: o Monday espera o número como string. */
export function serializeNumber(value: number): string {
  return String(value);
}

/** Serializador das colunas `status`/`color`: gravadas pelo rótulo visível. */
export function serializeStatus(label: string): { label: string } {
  return { label };
}

/**
 * Serializador da coluna `date`: **só o dia**, sem hora.
 *
 * A hora ia junto e descrevia o instante exato do início e do fim do intervalo —
 * precisão que o board não usa: o que se reporta ali é o dia em que o trabalho
 * aconteceu.
 *
 * O dia é o **local** (§6.6), não o dia em UTC. Com hora junto, o Monday
 * guardava em UTC e reexibia no fuso da conta, então o dia se acertava sozinho;
 * sem ela não há o que reconverter, e o instante das 21h em fuso negativo — dia
 * 28 para quem trabalhou, dia 29 em UTC — cairia no dia seguinte do board.
 */
export function serializeDate(iso: string): { date: string } {
  return { date: localDateISO(iso) };
}

/**
 * Serializador da coluna `dropdown`: uma lista de rótulos, mesmo com um só.
 *
 * Difere do `status`, que grava `{ label }` — passar um formato pelo outro faz o
 * Monday recusar a mutation inteira, e com ela o envio que estava correto.
 */
export function serializeDropdown(label: string): { labels: string[] } {
  return { labels: [label] };
}

/** Serializador da coluna `people`. */
export function serializePerson(userId: string): {
  personsAndTeams: { id: number; kind: "person" }[];
} {
  return { personsAndTeams: [{ id: Number(userId), kind: "person" }] };
}

/** Converte segundos em horas decimais com 2 casas, como o Monday reporta. */
export function secondsToDecimalHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

/**
 * Monta o `column_values` de uma atividade do Monday. Colunas opcionais só
 * entram no payload quando há valor — gravar `null` num status limparia o campo.
 *
 * **Coluna que o board não tem também não entra**, e a omissão é o mecanismo de
 * segurança, não uma economia: mandar um id inexistente faz o Monday recusar a
 * mutation inteira (HTTP 200 com `InvalidColumnIdException`/
 * `ResourceNotFoundException` no corpo), e o segundo desses o `MondayClient`
 * traduz em `MondayNotFoundError` — que o sender lê como "apagaram o item" e
 * responde recriando. Uma coluna a mais no payload viraria atividade duplicada
 * no board a cada ciclo, não um erro visível.
 */
export function buildActivityColumnValues(
  input: BuildActivityColumnValuesInput
): Record<string, unknown> {
  const { columnIds } = input;
  const values: Record<string, unknown> = {
    [columnIds.reportedHours]: serializeNumber(input.hoursDecimal),
    [columnIds.person]: serializePerson(input.userId),
  };

  if (columnIds.billingType) {
    values[columnIds.billingType] = serializeStatus(
      input.billable ? MONDAY_BILLABLE_LABEL : MONDAY_NON_BILLABLE_LABEL
    );
  }
  if (columnIds.status) {
    values[columnIds.status] = serializeStatus(input.statusLabel ?? MONDAY_COMPLETED_LABEL);
  }
  if (input.activityTypeLabel) {
    values[columnIds.activityType] = serializeStatus(input.activityTypeLabel);
  }
  if (columnIds.projectStage && input.projectStageLabel) {
    values[columnIds.projectStage] = serializeStatus(input.projectStageLabel);
  }
  // O motivo responde "por que **esta** hora não foi faturada": em hora
  // faturável ele não tem o que dizer, e mandá-lo junto deixaria no board uma
  // justificativa que contradiz o Billing type ao lado.
  if (columnIds.nonBillableReason && !input.billable && input.nonBillableReasonLabel) {
    values[columnIds.nonBillableReason] = serializeDropdown(input.nonBillableReasonLabel);
  }

  return values;
}

/**
 * Colunas Start Date e End Date: o intervalo **trabalhado no DeskClock**, do
 * início da primeira tarefa do grupo ao fim da última — em dias, sem hora
 * (ver `serializeDate`).
 *
 * Antes as duas levavam o instante do envio, o que descrevia quando a linha
 * nasceu no Monday e não quando o trabalho aconteceu — lançamento retroativo e
 * envio diário caíam todos no dia do envio, e o filtro por período do
 * gerenciador de atividades (que lê justamente este par) mostrava a atividade no
 * dia errado.
 *
 * Vindo da tarefa, o valor é estável entre execuções, então elas entram também
 * no **update**: era a volatilidade do "agora" que as obrigava a ficar só no
 * create, sob pena de o payload mudar a cada ciclo e nenhum grupo cair mais no
 * skip por "nada mudou".
 */
export function buildActivityDateColumns(
  columnIds: MondayActivityColumnIds,
  startISO: string,
  endISO: string
): Record<string, unknown> {
  return {
    ...(columnIds.startDate ? { [columnIds.startDate]: serializeDate(startISO) } : {}),
    ...(columnIds.endDate ? { [columnIds.endDate]: serializeDate(endISO) } : {}),
  };
}
