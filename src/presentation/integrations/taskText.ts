import type { CustomValues } from "@domain/entities/CustomField";
import { TaskTextResponseError } from "@domain/usecases/llm/taskText/errors";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { LlmEmptyResponseError } from "@infra/integrations/llm/errors";
import { describeLlmError } from "@presentation/sections/integrations/llm/llmConnection";

// A ponte entre a interpretação do texto (`domain/usecases/llm/taskText/`) e
// as superfícies que iniciam ou lançam a tarefa — omnibox, popup e Lançamento
// Manual (`docs-internal/specs/iniciar-tarefa-por-texto.md`).

const UNREADABLE_RESPONSE = new TaskTextResponseError().message;

/**
 * O erro da interpretação na frase da tela. Resposta que não deu para ler —
 * sem JSON, ou vazia — pede só tentar de novo; o resto é o que o
 * `describeLlmError` já diz sobre chave, cota e rede.
 */
export function describeTaskTextError(error: unknown): string {
  if (error instanceof TaskTextResponseError || error instanceof LlmEmptyResponseError) {
    return UNREADABLE_RESPONSE;
  }
  return describeLlmError(error);
}

/** Os campos do `startTask` que a interpretação preenche. */
export interface TaskTextStartInput {
  name: string | null;
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  customValues: CustomValues;
  startTime: string;
  plannedTaskId: null;
}

/**
 * A interpretação como início de tarefa. O `startTime` é o instante do
 * **primeiro envio** do texto — a espera pela IA não come os segundos da
 * tarefa. Ambiguidade não resolvida na prévia segue vazia: escolher sozinho
 * seria trocar o projeto do cliente em silêncio.
 */
export function taskTextStartInput(
  interpretation: TaskTextInterpretation,
  submittedAt: string
): TaskTextStartInput {
  return {
    name: interpretation.name,
    projectId: interpretation.projectId,
    categoryId: interpretation.categoryId,
    billable: interpretation.billable,
    customValues: interpretation.customValues,
    startTime: submittedAt,
    plannedTaskId: null,
  };
}

/**
 * O texto não trouxe nada além do nome — é o que acontece sem provedor e sem
 * sigla. Não há o que conferir, e a prévia seria um Enter a mais por nada.
 */
export function isNameOnly(interpretation: TaskTextInterpretation): boolean {
  return (
    interpretation.projectId === null &&
    interpretation.categoryId === null &&
    !interpretation.billableExplicit &&
    Object.keys(interpretation.customValues).length === 0 &&
    interpretation.ambiguities.length === 0 &&
    interpretation.notFound.length === 0
  );
}
