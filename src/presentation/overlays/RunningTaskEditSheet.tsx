import { Check, Clock, X } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { ActionChip } from "@presentation/components/ActionChip";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { BillableChip, Button, IconButton, Input } from "@presentation/components/ui";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import {
  useRunningTaskEditor,
  type EditRunningTaskInput,
} from "@presentation/hooks/useRunningTaskEditor";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface RunningTaskEditSheetProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  customFields: CustomField[];
  /** Ações da planejada de origem — disparadas daqui, nunca editadas. */
  actions: PlannedTaskAction[];
  onSave: (input: EditRunningTaskInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Tudo o que a tarefa em execução tem além do cronômetro, **dentro** do popup e
 * sem crescer a janela — mesmo desenho do `PlannedTaskEditSheet` (§5.1.2).
 *
 * Ele existe porque o card de execução passou a dividir o corpo com a lista de
 * planejadas e executadas: os chips de projeto, categoria e hora que moravam na
 * seção de execução não cabem mais ali, e o número de campos personalizados é do
 * usuário. O corpo rola por dentro, e é isso que absorve os dois.
 *
 * Substitui o `RunningCustomFieldsSheet`, que era este mesmo painel com um campo
 * só. O que trouxe os campos personalizados para o overlay foi o envio de horas
 * ao Monday, que recusa a atividade sem Project Stage (§5.7): quem trabalha só
 * pelo overlay parava a tarefa sem ter onde preenchê-lo.
 */
export function RunningTaskEditSheet({
  task,
  projects,
  categories,
  customFields,
  actions,
  onSave,
  onClose,
}: RunningTaskEditSheetProps) {
  const editor = useRunningTaskEditor({ task, projects, categories, onSave, onClose });

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
        <span className="text-sm font-medium text-fg-secondary truncate">Editar em execução</span>
        <IconButton
          icon={<X size={14} />}
          title="Cancelar"
          size="sm"
          variant="neutral"
          onClick={onClose}
        />
      </div>

      {/* Corpo rolável: é ele que absorve campos personalizados e ações sem
          mexer no tamanho da janela. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        <Input
          autoFocus
          size="sm"
          value={editor.name}
          onChange={(e) => editor.setName(e.target.value)}
          placeholder="Nome da tarefa"
        />

        <Autocomplete
          value={editor.projectName}
          onChange={editor.setProjectName}
          onSelect={editor.selectProject}
          options={projects}
          placeholder="Projeto"
          size="sm"
          className="w-full"
        />

        {/* Billable encostado na categoria, como nos demais formulários: é a
            categoria que define o padrão (§6.2), e o ajuste manual pertence ao
            mesmo campo. */}
        <div className="flex items-center gap-1 pr-2 bg-raised border border-border rounded-control focus-within:border-accent transition-colors">
          <Autocomplete
            value={editor.categoryName}
            onChange={editor.setCategoryName}
            onSelect={editor.selectCategory}
            options={editor.categoryOptions}
            placeholder="Categoria"
            className="flex-1 min-w-0"
            variant="bare"
            size="sm"
          />
          <BillableChip
            billable={editor.billable}
            onToggle={() => editor.setBillable(!editor.billable)}
          />
        </div>

        {/* Hora de início: alterá-la recalcula o cronômetro (§5.1.2). */}
        <div className="flex items-center gap-1.5 pl-2 bg-raised border border-border rounded-control focus-within:border-accent transition-colors">
          <Clock size={14} className="text-fg-muted shrink-0" />
          <Input
            type="time"
            variant="bare"
            size="sm"
            aria-label="Hora de início"
            value={editor.startTime}
            onChange={(e) => editor.setStartTime(e.target.value)}
            className="flex-1 min-w-0"
          />
        </div>

        {customFields.length > 0 && (
          <>
            <div className="border-t border-border-subtle mt-0.5" />
            <CustomFieldInputs
              fields={customFields}
              values={editor.customValues}
              onChange={editor.setCustomValues}
              compact
            />
          </>
        )}

        {/* Ações da planejada de origem: aqui elas se disparam, e é só isso —
            editá-las continua sendo trabalho do painel da planejada. */}
        {actions.length > 0 && (
          <>
            <div className="border-t border-border-subtle mt-0.5" />
            <p className="text-overline uppercase text-fg-muted">Ações</p>
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action, i) => (
                <ActionChip key={i} action={action} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-t border-border/60">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<Check size={14} />}
          loading={editor.saving}
          onClick={() => void editor.save()}
          className="ml-auto"
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
