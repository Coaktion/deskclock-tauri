import { Check } from "lucide-react";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Task } from "@domain/entities/Task";
import { CustomFieldInputs } from "./CustomFieldInputs";
import { useRunningCustomFields } from "@presentation/hooks/useRunningCustomFields";

interface OmniboxCustomFieldsPanelProps {
  task: Task;
  fields: CustomField[];
  onSave: (values: CustomValues) => Promise<void>;
  onClose: () => void;
}

/**
 * Campos personalizados da tarefa em execução, no omnibox. Aqui há largura de
 * sobra e o painel abre **embutido**, abaixo da linha da tarefa — ao contrário
 * do overlay, que precisa cobrir o conteúdo para não crescer a janela. O estado
 * é o mesmo `useRunningCustomFields` dos dois lados (§9.4).
 */
export function OmniboxCustomFieldsPanel({
  task,
  fields,
  onSave,
  onClose,
}: OmniboxCustomFieldsPanelProps) {
  const editor = useRunningCustomFields({ task, onSave, onClose });

  return (
    <div
      className="mx-4 mb-3 pt-3 border-t border-border-subtle space-y-2"
      onKeyDown={(e) => {
        // ESC fecha só o painel: o omnibox inteiro reagindo ao ESC fecharia a
        // edição junto com o que foi digitado.
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <CustomFieldInputs
        fields={fields}
        values={editor.values}
        onChange={editor.setValues}
        onEnter={() => void editor.save()}
        compact
      />
      <div className="flex gap-2 justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => void editor.save()}
          disabled={editor.saving}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium bg-accent/10 border border-accent/30 text-accent-text hover:bg-accent/20 disabled:opacity-50 rounded-control transition-colors"
        >
          <Check size={14} />
          Salvar
        </button>
      </div>
    </div>
  );
}
