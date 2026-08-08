import { X, Plus, ExternalLink, FolderOpen, Trash2, DollarSign } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { boxClass, fieldClass } from "@presentation/components/fieldStyles";
import { Select } from "@presentation/components/ui";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import {
  usePlannedTaskEditor,
  type EditPlannedTaskInput,
} from "@presentation/hooks/usePlannedTaskEditor";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { todayISO } from "@shared/utils/time";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

export type { EditPlannedTaskInput };

interface EditPlannedTaskModalProps {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  onSave: (id: string, input: EditPlannedTaskInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Só dias úteis (§5.3) — sábado e domingo não existem no planejamento, e
 * marcá-los aqui criava uma recorrente que nunca aparecia na lista. Os valores
 * continuam na escala do `Date` (1=Seg…5=Sex): reindexar para 0..4 mudaria o
 * dia de toda tarefa recorrente já gravada.
 */
const WEEKDAYS = [
  { value: 1, label: "Seg", title: "Segunda" },
  { value: 2, label: "Ter", title: "Terça" },
  { value: 3, label: "Qua", title: "Quarta" },
  { value: 4, label: "Qui", title: "Quinta" },
  { value: 5, label: "Sex", title: "Sexta" },
];

export function EditPlannedTaskModal({
  task,
  projects,
  categories,
  onSave,
  onClose,
}: EditPlannedTaskModalProps) {
  const { activeFields } = useCustomFields();
  const {
    name,
    setName,
    projectName,
    setProjectName,
    selectProject,
    categoryName,
    setCategoryName,
    selectCategory,
    categoryOptions,
    billable,
    setBillable,
    scheduleType,
    setScheduleType,
    scheduleDate,
    setScheduleDate,
    recurringDays,
    toggleDay,
    periodStart,
    setPeriodStart,
    periodEnd,
    setPeriodEnd,
    actions,
    addAction,
    removeAction,
    newActionType,
    setNewActionType,
    newActionValue,
    setNewActionValue,
    customValues,
    setCustomValues,
    saving,
    save: handleSave,
  } = usePlannedTaskEditor({ task, projects, categories, onSave, onClose });

  useEscapeToClose(onClose);
  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    <div
      data-modal-open
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        onKeyDown={handleKeyDown}
        className="bg-surface border border-border rounded-card w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold text-fg">Editar tarefa planejada</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-fg-secondary hover:text-fg hover:bg-raised rounded-control transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">
          {/* Dados da tarefa — mesmo vocabulário visual do `EditTaskModal` e das
              duas telas de entrada (`fieldStyles.ts`): campo comum desenha a
              própria casca, e quem divide a linha com um botão vive dentro de
              uma caixa. */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wide">Tarefa</p>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da tarefa"
              autoComplete="off"
              className={fieldClass}
            />
            <div className="grid grid-cols-2 gap-2">
              <Autocomplete
                value={projectName}
                onChange={setProjectName}
                onSelect={selectProject}
                options={projects}
                placeholder="Projeto"
              />
              {/* Billable encostado na categoria, como no popup e nas duas telas
                  de entrada: é a categoria que define o padrão (§6.2), e o
                  ajuste manual pertence ao mesmo campo. */}
              <div className={`${boxClass} flex items-center pr-2`}>
                <Autocomplete
                  value={categoryName}
                  onChange={setCategoryName}
                  onSelect={selectCategory}
                  options={categoryOptions}
                  placeholder="Categoria"
                  className="flex-1 min-w-0"
                  variant="bare"
                />
                <button
                  type="button"
                  onClick={() => setBillable((b) => !b)}
                  title={
                    billable
                      ? "Billable — clique para alternar"
                      : "Non-billable — clique para alternar"
                  }
                  className={`flex items-center gap-1 shrink-0 transition-colors ${
                    billable ? "text-billable" : "text-fg-muted hover:text-fg-secondary"
                  }`}
                >
                  <DollarSign size={14} />
                </button>
              </div>
            </div>

            {/* Campos personalizados logo depois de categoria e billable, antes
                do agendamento (§5.1.2): são atributos do trabalho em si, e o
                agendamento é o bloco que diz *quando* — intercalá-los partia os
                dois grupos ao meio. */}
            <CustomFieldInputs
              fields={activeFields}
              values={customValues}
              onChange={setCustomValues}
            />
          </div>

          <div className="border-t border-border-subtle" />

          {/* Agendamento */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wide">Agendamento</p>
            <div className="flex gap-2">
              {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`flex-1 py-2 text-sm rounded-control border transition-colors ${
                    scheduleType === type
                      ? "bg-accent/10 border-accent text-accent-text"
                      : "bg-raised border-border text-fg-secondary hover:text-fg"
                  }`}
                >
                  {type === "specific_date"
                    ? "Data única"
                    : type === "recurring"
                      ? "Recorrente"
                      : "Período"}
                </button>
              ))}
            </div>

            {scheduleType === "specific_date" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScheduleDate(todayISO())}
                  className={`px-3 py-2 text-sm rounded-control border transition-colors whitespace-nowrap ${
                    scheduleDate === todayISO()
                      ? "bg-accent/10 border-accent text-accent-text"
                      : "bg-raised border-border text-fg-secondary hover:text-fg"
                  }`}
                >
                  Hoje
                </button>
                <DatePickerInput
                  value={scheduleDate}
                  onChange={setScheduleDate}
                  className="flex-1"
                />
              </div>
            )}

            {scheduleType === "recurring" && (
              <div className="flex gap-2">
                {WEEKDAYS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    title={day.title}
                    onClick={() => toggleDay(day.value)}
                    className={`flex-1 py-2 text-sm rounded-control border transition-colors ${
                      recurringDays.includes(day.value)
                        ? "bg-accent/10 border-accent text-accent-text"
                        : "bg-raised border-border text-fg-secondary hover:text-fg"
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            )}

            {scheduleType === "period" && (
              <div className="flex items-center gap-3">
                <DatePickerInput value={periodStart} onChange={setPeriodStart} className="flex-1" />
                <span className="text-fg-muted text-sm shrink-0">→</span>
                <DatePickerInput value={periodEnd} onChange={setPeriodEnd} className="flex-1" />
              </div>
            )}
          </div>

          <div className="border-t border-border-subtle" />

          {/* Ações */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wide">
              Ações ao iniciar
            </p>

            {actions.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {actions.map((action, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 bg-raised rounded-control"
                  >
                    <span
                      className={`shrink-0 ${action.type === "open_url" ? "text-accent-text" : "text-purple-400"}`}
                    >
                      {action.type === "open_url" ? (
                        <ExternalLink size={14} />
                      ) : (
                        <FolderOpen size={14} />
                      )}
                    </span>
                    <span
                      className="flex-1 text-sm text-fg-secondary truncate"
                      title={action.value}
                    >
                      {action.value}
                    </span>
                    <button
                      onClick={() => removeAction(i)}
                      className="shrink-0 text-fg-muted hover:text-danger transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <Select
                aria-label="Tipo da ação"
                value={newActionType}
                onChange={(e) => setNewActionType(e.target.value as PlannedTaskAction["type"])}
              >
                <option value="open_url">URL</option>
                <option value="open_file">Arquivo</option>
              </Select>
              <input
                type="text"
                value={newActionValue}
                onChange={(e) => setNewActionValue(e.target.value)}
                onKeyDown={(e) => {
                  // Sub-formulário: aqui o Enter adiciona a ação, não salva a
                  // tarefa. O `preventDefault` avisa isso ao `useSubmitOnEnter`.
                  if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  addAction();
                }}
                placeholder={newActionType === "open_url" ? "https://..." : "/caminho/arquivo"}
                autoComplete="off"
                className="flex-1 px-3 py-2 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={addAction}
                disabled={!newActionValue.trim()}
                className="px-3 py-2 text-sm bg-border hover:opacity-90 disabled:opacity-40 text-fg rounded-control transition"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-fg-secondary hover:text-fg hover:bg-raised rounded-control transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm bg-accent hover:opacity-90 disabled:opacity-50 text-white rounded-control transition"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
