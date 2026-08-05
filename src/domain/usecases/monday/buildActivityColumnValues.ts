import type { MondayActivityColumnIds } from "@shared/types/mondayConfig";

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
 * Serializador da coluna `date`, que o Monday guarda **em UTC** e exibe no fuso
 * da conta. Mandar a hora local aqui deslocaria o horário exibido.
 */
export function serializeDate(iso: string): { date: string; time: string } {
  const [date, rest] = new Date(iso).toISOString().split("T");
  return { date, time: rest.slice(0, 8) };
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

  return values;
}

/**
 * Colunas Start Date e End Date: o intervalo **trabalhado no DeskClock**, do
 * início da primeira tarefa do grupo ao fim da última.
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
