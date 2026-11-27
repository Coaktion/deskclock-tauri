import {
  isNameOnly,
  taskTextStartInput,
  type TaskTextStartInput,
} from "@presentation/integrations/taskText";
import type {
  TaskTextStatus,
  UseTaskTextInterpretationResult,
} from "@presentation/hooks/useTaskTextInterpretation";

/** O que as superfícies de texto usam do intérprete — `useTaskTextInterpretation` o satisfaz. */
export type TaskTextInterpreter = Pick<
  UseTaskTextInterpretationResult,
  "status" | "interpretation" | "submittedAt" | "submit" | "dismiss" | "reset"
>;

interface TaskTextEntryParams {
  interpreter?: TaskTextInterpreter;
  text: string;
  /**
   * Projeto, categoria ou billable escolhidos à mão nos chips. Aí o texto é só
   * o nome: analisá-lo deixaria a IA sobrescrever o que o usuário já escolheu.
   */
  manualFields: boolean;
  /** O início de sempre, com o rascunho como está. */
  startRaw: () => Promise<void>;
  startInterpreted: (input: TaskTextStartInput) => Promise<void>;
}

/**
 * O que o Enter (e o Play) fazem com o texto nas três superfícies que iniciam
 * tarefa por texto — omnibox, `TaskTextSheet` do popup e aba IA do lançamento
 * manual (`docs-internal/specs/iniciar-tarefa-por-texto.md`, itens 9–11). Cada
 * uma só troca o destino (`startRaw` / `startInterpreted`):
 *
 * - campo vazio, chips escolhidos à mão ou sem intérprete → inicia na hora;
 * - texto, sem prévia → analisa; o que volta só com o nome inicia direto;
 * - prévia aberta → inicia com os campos dela;
 * - erro na análise → o segundo Enter inicia o texto como nome, sem travar.
 */
export function taskTextEntry({
  interpreter,
  text,
  manualFields,
  startRaw,
  startInterpreted,
}: TaskTextEntryParams) {
  const status: TaskTextStatus = interpreter?.status ?? "idle";

  async function advance(): Promise<void> {
    if (!interpreter || !text.trim() || manualFields || status === "error") return startRaw();
    if (status === "analyzing") return;
    if (status === "preview" && interpreter.interpretation && interpreter.submittedAt) {
      return startInterpreted(
        taskTextStartInput(interpreter.interpretation, interpreter.submittedAt)
      );
    }
    const submission = await interpreter.submit(text);
    if (submission && isNameOnly(submission.interpretation)) {
      await startInterpreted(taskTextStartInput(submission.interpretation, submission.submittedAt));
    }
  }

  /** ESC com prévia, análise ou erro na tela: fecha. `true` = a tecla foi consumida. */
  function closePreview(): boolean {
    if (!interpreter || status === "idle") return false;
    interpreter.dismiss();
    return true;
  }

  /** Texto editado descarta a prévia; apagado, esquece também o instante do envio. */
  function textEdited(next: string) {
    if (!interpreter) return;
    if (!next.trim()) interpreter.reset();
    else if (status !== "idle") interpreter.dismiss();
  }

  return { status, advance, closePreview, textEdited };
}
