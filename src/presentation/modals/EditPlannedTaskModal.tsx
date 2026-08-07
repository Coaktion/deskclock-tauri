import { X, Plus, ExternalLink, FolderOpen, Trash2, DollarSign } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { bareInputClass, boxClass, fieldClass } from "@presentation/components/fieldStyles";
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
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl mx-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 shrink-0">
          <h2 className="text-base font-semibold text-gray-100">Editar tarefa planejada</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
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
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tarefa</p>
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
                  inputClassName={bareInputClass}
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
                    billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
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

          <div className="border-t border-gray-800" />

          {/* Agendamento */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Agendamento</p>
            <div className="flex gap-2">
              {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setScheduleType(type)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                    scheduleType === type
                      ? "bg-blue-900/40 border-blue-600 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
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
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors whitespace-nowrap ${
                    scheduleDate === todayISO()
                      ? "bg-blue-900/40 border-blue-600 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
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
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                      recurringDays.includes(day.value)
                        ? "bg-blue-900/40 border-blue-600 text-blue-300"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
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
                <span className="text-gray-500 text-sm shrink-0">→</span>
                <DatePickerInput value={periodEnd} onChange={setPeriodEnd} className="flex-1" />
              </div>
            )}
          </div>

          <div className="border-t border-gray-800" />

          {/* Ações */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Ações ao iniciar
            </p>

            {actions.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {actions.map((action, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg">
                    <span
                      className={`shrink-0 ${action.type === "open_url" ? "text-blue-400" : "text-purple-400"}`}
                    >
                      {action.type === "open_url" ? (
                        <ExternalLink size={14} />
                      ) : (
                        <FolderOpen size={14} />
                      )}
                    </span>
                    <span className="flex-1 text-sm text-gray-300 truncate" title={action.value}>
                      {action.value}
                    </span>
                    <button
                      onClick={() => removeAction(i)}
                      className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <select
                value={newActionType}
                onChange={(e) => setNewActionType(e.target.value as PlannedTaskAction["type"])}
                className="px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-blue-500"
              >
                <option value="open_url">URL</option>
                <option value="open_file">Arquivo</option>
              </select>
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
                className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={addAction}
                disabled={!newActionValue.trim()}
                className="px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
