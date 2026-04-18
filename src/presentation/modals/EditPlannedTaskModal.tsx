import { useState, useEffect } from "react";
import { X, Plus, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { UUID } from "@shared/types";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { todayISO } from "@shared/utils/time";

export interface EditPlannedTaskInput {
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  scheduleType?: ScheduleType;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[];
}

interface EditPlannedTaskModalProps {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  onSave: (id: string, input: EditPlannedTaskInput) => Promise<void>;
  onClose: () => void;
}

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function EditPlannedTaskModal({
  task,
  projects,
  categories,
  onSave,
  onClose,
}: EditPlannedTaskModalProps) {
  const [name, setName] = useState(task.name);
  const [projectId, setProjectId] = useState<UUID | null>(task.projectId);
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryId, setCategoryId] = useState<UUID | null>(task.categoryId);
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(task.scheduleType);
  const [scheduleDate, setScheduleDate] = useState(task.scheduleDate ?? "");
  const [recurringDays, setRecurringDays] = useState<number[]>(task.recurringDays ?? []);
  const [periodStart, setPeriodStart] = useState(task.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(task.periodEnd ?? "");
  const [actions, setActions] = useState<PlannedTaskAction[]>(task.actions);
  const [newActionType, setNewActionType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newActionValue, setNewActionValue] = useState("");
  const [saving, setSaving] = useState(false);

  // window listener cobre casos onde o foco está fora do backdrop (portais, body).
  // defaultPrevented = true significa que o Autocomplete consumiu o ESC para fechar o dropdown.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleDay(day: number) {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function handleAddAction() {
    if (!newActionValue.trim()) return;
    setActions((prev) => [...prev, { type: newActionType, value: newActionValue.trim() }]);
    setNewActionValue("");
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(task.id, {
        name: name.trim() || task.name,
        projectId,
        categoryId,
        billable,
        scheduleType,
        scheduleDate: scheduleType === "specific_date" ? scheduleDate || null : null,
        recurringDays: scheduleType === "recurring" ? recurringDays : null,
        periodStart: scheduleType === "period" ? periodStart || null : null,
        periodEnd: scheduleType === "period" ? periodEnd || null : null,
        actions,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

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
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl mx-4">
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

          {/* Dados da tarefa */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tarefa</p>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSave();
              }}
              placeholder="Nome da tarefa"
              className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <Autocomplete
                value={projectName}
                onChange={setProjectName}
                onSelect={(o) => {
                  setProjectId(o.id);
                  setProjectName(o.name);
                }}
                options={projects}
                placeholder="Projeto"
                className="flex-1"
              />
              <Autocomplete
                value={categoryName}
                onChange={setCategoryName}
                onSelect={(o) => {
                  setCategoryId(o.id);
                  setCategoryName(o.name);
                  const cat = categories.find((c) => c.id === o.id);
                  if (cat) setBillable(cat.defaultBillable);
                }}
                options={categories}
                placeholder="Categoria"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setBillable((b) => !b)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors shrink-0 ${
                  billable
                    ? "bg-green-900/40 border-green-700 text-green-400"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
                }`}
              >
                {billable ? "Billable" : "N/Billable"}
              </button>
            </div>
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
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 py-2 text-sm rounded-lg border transition-colors ${
                      recurringDays.includes(idx)
                        ? "bg-blue-900/40 border-blue-600 text-blue-300"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {scheduleType === "period" && (
              <div className="flex items-center gap-3">
                <DatePickerInput
                  value={periodStart}
                  onChange={setPeriodStart}
                  className="flex-1"
                />
                <span className="text-gray-500 text-sm shrink-0">→</span>
                <DatePickerInput
                  value={periodEnd}
                  onChange={setPeriodEnd}
                  className="flex-1"
                />
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
                  <li
                    key={i}
                    className="flex items-center gap-3 px-3 py-2 bg-gray-800 rounded-lg"
                  >
                    <span
                      className={`shrink-0 ${action.type === "open_url" ? "text-blue-400" : "text-purple-400"}`}
                    >
                      {action.type === "open_url" ? (
                        <ExternalLink size={14} />
                      ) : (
                        <FolderOpen size={14} />
                      )}
                    </span>
                    <span
                      className="flex-1 text-sm text-gray-300 truncate"
                      title={action.value}
                    >
                      {action.value}
                    </span>
                    <button
                      onClick={() => setActions((prev) => prev.filter((_, j) => j !== i))}
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
                  if (e.key === "Enter") handleAddAction();
                }}
                placeholder={newActionType === "open_url" ? "https://..." : "/caminho/arquivo"}
                className="flex-1 px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleAddAction}
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
