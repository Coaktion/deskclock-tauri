import type { RefObject } from "react";
import { TaskTextHint } from "@presentation/components/taskText/TaskTextHint";
import { TaskTextPreview } from "@presentation/components/taskText/TaskTextPreview";
import { Field, Input } from "@presentation/components/ui";
import type { useRetroactiveTextEntry } from "@presentation/hooks/useRetroactiveTextEntry";

interface RetroactiveTextFieldsProps {
  entry: ReturnType<typeof useRetroactiveTextEntry>;
  /**
   * O `nameRef` do formulário. Na aba IA é este campo que faz as vezes do nome,
   * e é para ele que o `handleAdd` devolve o foco ao encadear a próxima.
   */
  inputRef: RefObject<HTMLInputElement | null>;
}

/**
 * O "quê" da aba IA: a instrução com as siglas, o texto curto e a prévia do que
 * foi entendido. Substitui nome, projeto, categoria, billable e campos
 * personalizados; os horários ficam nos campos de sempre, logo abaixo.
 */
export function RetroactiveTextFields({ entry, inputRef }: RetroactiveTextFieldsProps) {
  const { interpreter } = entry;
  // Escolher na prévia tira o foco do campo; devolvê-lo é o que deixa o
  // próximo Enter confirmar, em vez de reabrir o chip clicado.
  const backToInput = () => inputRef.current?.focus();

  return (
    <div className="space-y-3" onKeyDown={entry.handleKeyDown}>
      <TaskTextHint instruction={interpreter.instruction} />
      <Field label="Tarefa" htmlFor="retro-text">
        <Input
          id="retro-text"
          ref={inputRef}
          variant="bare"
          value={entry.text}
          onChange={(e) => entry.changeText(e.target.value)}
          placeholder="Nome e siglas, ex.: P=projeto"
        />
      </Field>
      <TaskTextPreview
        status={interpreter.status}
        interpretation={interpreter.interpretation}
        error={interpreter.error}
        hints={interpreter.hints}
        catalog={interpreter.catalog}
        onChoose={(key, id) => {
          interpreter.choose(key, id);
          backToInput();
        }}
        onToggleBillable={() => {
          interpreter.setBillable(!interpreter.interpretation?.billable);
          backToInput();
        }}
        keysHint="Enter adiciona · Esc fecha"
        errorHint="Enter adiciona com o texto como nome."
      />
    </div>
  );
}
