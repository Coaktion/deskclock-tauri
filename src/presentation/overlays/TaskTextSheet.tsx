import { useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { TaskTextHint } from "@presentation/components/taskText/TaskTextHint";
import { TaskTextPreview } from "@presentation/components/taskText/TaskTextPreview";
import { Button, IconButton, Input } from "@presentation/components/ui";
import { omniboxTextEntry } from "@presentation/hooks/omniboxTextEntry";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { useTaskTextInterpretation } from "@presentation/hooks/useTaskTextInterpretation";
import type { TaskTextStartInput } from "@presentation/integrations/taskText";

interface TaskTextSheetProps {
  /** O início do popup — `startTime` e `customValues` inclusos. */
  onStart: (input: TaskTextStartInput | { name: string; billable: boolean }) => Promise<void>;
  onClose: () => void;
}

/**
 * O "Iniciar com IA" do popup: o texto curto da tarefa, a prévia e o início,
 * **dentro** do popup e no tamanho que ele já tem — o desenho dos painéis de
 * edição (`RunningTaskEditSheet`).
 *
 * O que o Enter faz com o texto é o mesmo do omnibox (`omniboxTextEntry`):
 * analisa; o que volta só com o nome inicia direto; com a prévia aberta,
 * inicia com os campos dela e com o instante do primeiro envio; com erro, o
 * segundo Enter inicia o texto como nome. Aqui não há chips manuais, e o campo
 * vazio não inicia nada — para a tarefa sem nome, o rodapé tem o "Nova tarefa".
 *
 * ESC fecha a prévia antes do painel: o campo consome a tecla, e o
 * `useEscapeToClose` respeita o que já foi consumido.
 */
export function TaskTextSheet({ onStart, onClose }: TaskTextSheetProps) {
  const interpreter = useTaskTextInterpretation();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function startAndClose(input: Parameters<TaskTextSheetProps["onStart"]>[0]) {
    await onStart(input);
    onClose();
  }

  const entry = omniboxTextEntry({
    interpreter,
    text,
    manualFields: false,
    startRaw: () => startAndClose({ name: text.trim(), billable: true }),
    startInterpreted: startAndClose,
  });

  const analyzing = entry.status === "analyzing";
  const empty = !text.trim();

  function advance() {
    if (empty) return;
    void entry.advance();
  }

  useEscapeToClose(onClose);
  const submitOnEnter = useSubmitOnEnter(advance, { disabled: analyzing });

  function handleKeyDown(e: React.KeyboardEvent) {
    // O menu de candidatos da prévia consome o próprio ESC; o que chega aqui
    // consumido não fecha nada além dele.
    if (e.key === "Escape" && !e.defaultPrevented && entry.closePreview()) {
      e.preventDefault();
      inputRef.current?.focus();
      return;
    }
    submitOnEnter(e);
  }

  // Escolher na prévia tira o foco do campo; devolvê-lo é o que deixa o
  // próximo Enter iniciar, em vez de reabrir o chip clicado.
  const backToInput = () => inputRef.current?.focus();
  const confirming = entry.status === "preview" || entry.status === "error";

  return (
    <div
      data-modal-open
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-40 flex flex-col bg-surface rounded-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-[37px] shrink-0 bg-raised border-b border-border">
        <span className="text-sm font-medium text-fg-secondary truncate">Iniciar com IA</span>
        <IconButton
          icon={<X size={14} />}
          title="Fechar"
          size="sm"
          variant="neutral"
          onClick={onClose}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        <TaskTextHint instruction={interpreter.instruction} />

        <Input
          ref={inputRef}
          autoFocus
          size="sm"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            entry.textEdited(e.target.value);
          }}
          placeholder="Em que você está trabalhando?"
        />

        <TaskTextPreview
          status={entry.status}
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
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-t border-border/60">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<Sparkles size={14} />}
          loading={analyzing}
          disabled={empty}
          onClick={advance}
          className="ml-auto"
        >
          {confirming ? "Iniciar" : "Analisar"}
        </Button>
      </div>
    </div>
  );
}
