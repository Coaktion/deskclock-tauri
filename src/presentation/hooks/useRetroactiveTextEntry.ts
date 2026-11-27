import { useState } from "react";
import { taskTextEntry } from "@presentation/hooks/taskTextEntry";
import type {
  RetroactiveTaskWhat,
  useRetroactiveForm,
} from "@presentation/hooks/useRetroactiveForm";
import { useTaskTextInterpretation } from "@presentation/hooks/useTaskTextInterpretation";

type RetroactiveForm = Pick<
  ReturnType<typeof useRetroactiveForm>,
  "applyInterpretation" | "handleAdd"
>;

/** O texto cru como a tarefa: sem análise, ou com a análise falhando. */
export function rawTextWhat(text: string): RetroactiveTaskWhat {
  return {
    name: text.trim() || null,
    projectId: null,
    categoryId: null,
    billable: true,
    customValues: {},
  };
}

/**
 * A aba IA do Lançamento Manual: o texto curto vira o "quê" da tarefa, e os
 * horários continuam nos campos do formulário
 * (`docs-internal/specs/iniciar-tarefa-por-texto.md`, decisão (b) e item 11).
 *
 * O desvio entre analisar, confirmar e lançar é o mesmo do omnibox
 * (`taskTextEntry`); muda só o destino. O `startTime` do primeiro envio que
 * ele entrega **não** vale aqui — o lançamento é retroativo, e o início é o da
 * cadeia do formulário.
 */
export function useRetroactiveTextEntry(form: RetroactiveForm) {
  const interpreter = useTaskTextInterpretation();
  const [text, setText] = useState("");

  async function add(what: RetroactiveTaskWhat, overrideEndHHMM?: string) {
    form.applyInterpretation(what);
    if (!(await form.handleAdd(overrideEndHHMM, what))) return;
    // A próxima da sequência: texto limpo, foco onde está, intérprete do zero.
    setText("");
    interpreter.reset();
  }

  function entry(overrideEndHHMM?: string) {
    return taskTextEntry({
      interpreter,
      text,
      manualFields: false,
      startRaw: () => add(rawTextWhat(text), overrideEndHHMM),
      startInterpreted: (input) => add(input, overrideEndHHMM),
    });
  }

  /** Enter, ou o Adicionar: analisa, confirma a prévia ou lança. */
  function submit(overrideEndHHMM?: string) {
    return entry(overrideEndHHMM).advance();
  }

  function changeText(next: string) {
    setText(next);
    entry().textEdited(next);
  }

  /** ESC com prévia na tela: fecha e consome a tecla (contrato 3 da §7). */
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    if (!entry().closePreview()) return;
    e.preventDefault();
    e.stopPropagation();
  }

  return { interpreter, text, changeText, submit, handleKeyDown };
}
