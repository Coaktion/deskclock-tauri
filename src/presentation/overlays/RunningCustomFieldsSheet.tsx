import { Check, X } from "lucide-react";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Task } from "@domain/entities/Task";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useRunningCustomFields } from "@presentation/hooks/useRunningCustomFields";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface RunningCustomFieldsSheetProps {
  task: Task;
  fields: CustomField[];
  onSave: (values: CustomValues) => Promise<void>;
  onClose: () => void;
}

/**
 * Campos personalizados da tarefa em execução, **dentro** do popup e sem crescer
 * a janela — mesmo desenho do `PlannedTaskEditSheet` (§5.1.2) e pela mesma razão:
 * o número de campos é do usuário, e empilhá-los na seção de execução tiraria o
 * overlay do canto onde ele foi deixado. O corpo rola por dentro.
 *
 * O que trouxe estes campos para cá foi o envio de horas ao Monday, que recusa a
 * atividade sem Project Stage (§5.7): quem trabalha só pelo overlay parava a
 * tarefa sem ter onde preenchê-lo, e descobria na falha do envio.
 */
export function RunningCustomFieldsSheet({
  task,
  fields,
  onSave,
  onClose,
}: RunningCustomFieldsSheetProps) {
  const editor = useRunningCustomFields({ task, onSave, onClose });

  useEscapeToClose(onClose);
  const handleKeyDown = useSubmitOnEnter(() => void editor.save(), { disabled: editor.saving });

  return (
    <div
      data-modal-open
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-40 flex flex-col bg-surface rounded-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-[37px] shrink-0 bg-raised border-b border-border">
        <span className="text-xs font-medium text-fg-secondary truncate">
          Campos personalizados
        </span>
        <button
          onClick={onClose}
          title="Cancelar"
          className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Corpo rolável: é ele que absorve qualquer quantidade de campos sem
          mexer no tamanho da janela. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
        <CustomFieldInputs
          fields={fields}
          values={editor.values}
          onChange={editor.setValues}
          compact
        />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-t border-border/60">
        <button
          onClick={onClose}
          className="px-2.5 py-1 text-xs text-fg-secondary hover:text-fg hover:bg-raised rounded-control transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => void editor.save()}
          disabled={editor.saving}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-control transition"
        >
          <Check size={14} />
          Salvar
        </button>
      </div>
    </div>
  );
}
