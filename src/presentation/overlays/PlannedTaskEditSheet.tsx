import { Check, ExternalLink, FolderOpen, Plus, Trash2, X } from "lucide-react";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { BillableChip, Input, Select } from "@presentation/components/ui";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import {
  usePlannedTaskEditor,
  type EditPlannedTaskInput,
} from "@presentation/hooks/usePlannedTaskEditor";
import { todayISO } from "@shared/utils/time";

interface PlannedTaskEditSheetProps {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  onSave: (id: string, input: EditPlannedTaskInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Só dias úteis (§5.3) — sábado e domingo não existem no planejamento. Os
 * valores continuam na escala do `Date` (1=Seg…5=Sex): reindexar para 0..4
 * mudaria o dia de toda tarefa recorrente já gravada.
 */
const WEEKDAYS = [
  { value: 1, label: "Seg", title: "Segunda" },
  { value: 2, label: "Ter", title: "Terça" },
  { value: 3, label: "Qua", title: "Quarta" },
  { value: 4, label: "Qui", title: "Quinta" },
  { value: 5, label: "Sex", title: "Sexta" },
];

const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  specific_date: "Data",
  recurring: "Repete",
  period: "Período",
};

const chipClass =
  "flex items-center justify-center gap-1 px-2 py-1 text-sm rounded-control border transition-colors";

/**
 * Edição da tarefa planejada **dentro** do popup, sem crescer a janela: painel
 * que cobre o conteúdo, com o corpo rolando por dentro.
 *
 * Os campos são os mesmos do `EditPlannedTaskModal` e o estado vem do mesmo
 * `usePlannedTaskEditor` — o que muda aqui é só a disposição: tudo empilhado em
 * uma coluna, rótulos curtos e alturas menores, porque a largura útil é de 264 px.
 */
export function PlannedTaskEditSheet({
  task,
  projects,
  categories,
  onSave,
  onClose,
}: PlannedTaskEditSheetProps) {
  const { activeFields } = useCustomFields();
  const editor = usePlannedTaskEditor({ task, projects, categories, onSave, onClose });

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
        <span className="text-sm font-medium text-fg-secondary truncate">Editar planejada</span>
        <button
          onClick={onClose}
          title="Cancelar"
          className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors shrink-0"
        >
          <X size={14} />
        </button>
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

        {/* Billable encostado na categoria, como no Lançamento Manual e no
            Planejamento: é a categoria que define o padrão (§6.2), e o ajuste
            manual pertence ao mesmo campo. */}
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

        {/* Campos personalizados logo depois de categoria e billable, antes do
            agendamento: são atributos do trabalho em si, como projeto e
            categoria, e o agendamento é o bloco que diz *quando* — separá-los
            deixava os dois grupos intercalados. */}
        {activeFields.length > 0 && (
          <>
            <div className="border-t border-border-subtle mt-0.5" />
            <CustomFieldInputs
              fields={activeFields}
              values={editor.customValues}
              onChange={editor.setCustomValues}
              compact
            />
          </>
        )}

        <div className="border-t border-border-subtle mt-0.5" />

        {/* Agendamento */}
        <div className="flex gap-1">
          {(Object.keys(SCHEDULE_LABELS) as ScheduleType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => editor.setScheduleType(type)}
              className={`flex-1 ${chipClass} ${
                editor.scheduleType === type
                  ? "bg-accent/10 border-accent text-accent-text"
                  : "bg-raised border-border text-fg-secondary hover:text-fg"
              }`}
            >
              {SCHEDULE_LABELS[type]}
            </button>
          ))}
        </div>

        {editor.scheduleType === "specific_date" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => editor.setScheduleDate(todayISO())}
              className={`shrink-0 ${chipClass} ${
                editor.scheduleDate === todayISO()
                  ? "bg-accent/10 border-accent text-accent-text"
                  : "bg-raised border-border text-fg-secondary hover:text-fg"
              }`}
            >
              Hoje
            </button>
            <DatePickerInput
              value={editor.scheduleDate}
              onChange={editor.setScheduleDate}
              className="flex-1"
            />
          </div>
        )}

        {editor.scheduleType === "recurring" && (
          <div className="flex gap-1">
            {WEEKDAYS.map((day) => (
              <button
                key={day.value}
                type="button"
                title={day.title}
                onClick={() => editor.toggleDay(day.value)}
                className={`flex-1 py-1 text-sm rounded-control border transition-colors ${
                  editor.recurringDays.includes(day.value)
                    ? "bg-accent/10 border-accent text-accent-text"
                    : "bg-raised border-border text-fg-secondary hover:text-fg"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}

        {editor.scheduleType === "period" && (
          <div className="flex flex-col gap-1.5">
            <DatePickerInput
              value={editor.periodStart}
              onChange={editor.setPeriodStart}
              className="w-full"
              label="Início"
            />
            <DatePickerInput
              value={editor.periodEnd}
              onChange={editor.setPeriodEnd}
              className="w-full"
              label="Fim"
            />
          </div>
        )}

        <div className="border-t border-border-subtle mt-0.5" />

        {/* Ações */}
        <p className="text-overline uppercase text-fg-muted">Ações</p>

        {editor.actions.length > 0 && (
          <ul className="flex flex-col gap-1">
            {editor.actions.map((action, i) => (
              <li key={i} className="flex items-center gap-1.5 px-2 py-1 bg-raised rounded-control">
                <span
                  className={`shrink-0 ${action.type === "open_url" ? "text-accent-text" : "text-purple-400"}`}
                >
                  {action.type === "open_url" ? (
                    <ExternalLink size={14} />
                  ) : (
                    <FolderOpen size={14} />
                  )}
                </span>
                <span className="flex-1 text-sm text-fg-secondary truncate" title={action.value}>
                  {action.value}
                </span>
                <button
                  onClick={() => editor.removeAction(i)}
                  title="Remover"
                  className="shrink-0 text-fg-muted hover:text-danger transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-1">
          <Select
            aria-label="Tipo da ação"
            size="sm"
            value={editor.newActionType}
            onChange={(e) => editor.setNewActionType(e.target.value as PlannedTaskAction["type"])}
            className="shrink-0"
          >
            <option value="open_url">URL</option>
            <option value="open_file">Arquivo</option>
          </Select>
          <Input
            size="sm"
            value={editor.newActionValue}
            onChange={(e) => editor.setNewActionValue(e.target.value)}
            onKeyDown={(e) => {
              // Sub-formulário: o Enter adiciona a ação, não salva a planejada.
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              editor.addAction();
            }}
            placeholder={editor.newActionType === "open_url" ? "https://..." : "/caminho"}
            className="flex-1 min-w-0"
          />
          <button
            onClick={editor.addAction}
            disabled={!editor.newActionValue.trim()}
            title="Adicionar ação"
            className="shrink-0 px-1.5 py-1 bg-border hover:opacity-90 disabled:opacity-40 text-fg rounded-control transition"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-t border-border/60">
        <button
          onClick={onClose}
          className="px-2.5 py-1 text-sm text-fg-secondary hover:text-fg hover:bg-raised rounded-control transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={() => void editor.save()}
          disabled={editor.saving}
          className="ml-auto flex items-center gap-1 px-2.5 py-1 text-sm font-medium bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-control transition"
        >
          <Check size={14} />
          Salvar
        </button>
      </div>
    </div>
  );
}
