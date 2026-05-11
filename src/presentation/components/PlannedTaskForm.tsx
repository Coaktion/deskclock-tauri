import { useState, useRef } from "react";
import { Plus, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { todayISO } from "@shared/utils/time";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { ToggleBillable } from "@presentation/components/ToggleBillable";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";

interface FormState {
  name: string;
  projectId: string | null;
  projectName: string;
  categoryId: string | null;
  categoryName: string;
  billable: boolean;
  scheduleType: ScheduleType;
  scheduleDate: string;
  recurringDays: number[];
  periodStart: string;
  periodEnd: string;
  actions: PlannedTaskAction[];
}

const INITIAL: FormState = {
  name: "",
  projectId: null,
  projectName: "",
  categoryId: null,
  categoryName: "",
  billable: true,
  scheduleType: "specific_date",
  scheduleDate: "",
  recurringDays: [],
  periodStart: "",
  periodEnd: "",
  actions: [],
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  specific_date: "Data única",
  recurring: "Recorrente",
  period: "Período",
};

interface PlannedTaskFormProps {
  projects: Project[];
  categories: Category[];
  showDateFields?: boolean;
  defaultDate?: string;
  onSubmit: (data: {
    name: string;
    projectId: string | null;
    categoryId: string | null;
    billable: boolean;
    scheduleType: ScheduleType;
    scheduleDate: string | null;
    recurringDays: number[] | null;
    periodStart: string | null;
    periodEnd: string | null;
    actions: PlannedTaskAction[];
  }) => Promise<void>;
}

export function PlannedTaskForm({
  projects,
  categories,
  showDateFields = false,
  defaultDate = "",
  onSubmit,
}: PlannedTaskFormProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL, scheduleDate: defaultDate });
  const [submitting, setSubmitting] = useState(false);
  const [newActionType, setNewActionType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newActionValue, setNewActionValue] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const days = prev.recurringDays.includes(day)
        ? prev.recurringDays.filter((d) => d !== day)
        : [...prev.recurringDays, day].sort();
      return { ...prev, recurringDays: days };
    });
  }

  function handleAddAction() {
    const value = newActionValue.trim();
    if (!value) return;
    set("actions", [...form.actions, { type: newActionType, value }]);
    setNewActionValue("");
  }

  function isScheduleValid() {
    if (form.scheduleType === "period")
      return !!form.periodStart && !!form.periodEnd && form.periodEnd >= form.periodStart;
    if (form.scheduleType === "recurring") return form.recurringDays.length > 0;
    return true;
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) return;
    if (!isScheduleValid()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: form.name.trim(),
        projectId: form.projectId,
        categoryId: form.categoryId,
        billable: form.billable,
        scheduleType: form.scheduleType,
        scheduleDate: form.scheduleType === "specific_date" ? form.scheduleDate || null : null,
        recurringDays: form.scheduleType === "recurring" ? form.recurringDays : null,
        periodStart: form.scheduleType === "period" ? form.periodStart || null : null,
        periodEnd: form.scheduleType === "period" ? form.periodEnd || null : null,
        actions: form.actions,
      });
      setForm((prev) => ({
        ...INITIAL,
        scheduleType: prev.scheduleType,
        scheduleDate: prev.scheduleDate,
        recurringDays: prev.recurringDays,
        periodStart: prev.periodStart,
        periodEnd: prev.periodEnd,
      }));
      nameRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-b border-gray-800">
      <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
        {/* Name input: full width */}
        <div className="px-3 py-2.5">
          <input
            ref={nameRef}
            type="text"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
            placeholder="Nova tarefa planejada"
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Field row: Projeto + Categoria + Adicionar */}
        <div className="flex items-center gap-2 px-3 pb-2.5 border-t border-gray-800/60 pt-2">
          <div className="flex-1">
            <Autocomplete
              value={form.projectName}
              onChange={(v) => {
                set("projectName", v);
                if (!v) set("projectId", null);
              }}
              onSelect={(o) => {
                set("projectId", o.id);
                set("projectName", o.name);
              }}
              onEnter={() => void handleSubmit()}
              options={projects}
              placeholder="Projeto"
              className=""
            />
          </div>
          <div className="flex-1">
            <Autocomplete
              value={form.categoryName}
              onChange={(v) => {
                set("categoryName", v);
                if (!v) set("categoryId", null);
              }}
              onSelect={(o) => {
                const cat = categories.find((c) => c.id === o.id);
                setForm((prev) => ({
                  ...prev,
                  categoryId: o.id,
                  categoryName: o.name,
                  ...(cat ? { billable: cat.defaultBillable } : {}),
                }));
              }}
              onEnter={() => void handleSubmit()}
              options={categories}
              placeholder="Categoria"
              className=""
            />
          </div>
          <ToggleBillable value={form.billable} onChange={(v) => set("billable", v)} />
          <button
            type="submit"
            disabled={!form.name.trim() || !isScheduleValid() || submitting}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Plus size={12} />
            Adicionar
          </button>
        </div>

        {/* Actions section */}
        <div className="border-t border-gray-800/60 px-3 py-2.5 flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ações ao iniciar</p>

          {form.actions.length > 0 && (
            <ul className="flex flex-col gap-1">
              {form.actions.map((action, i) => (
                <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800 rounded-lg">
                  <span className={`shrink-0 ${action.type === "open_url" ? "text-blue-400" : "text-purple-400"}`}>
                    {action.type === "open_url" ? <ExternalLink size={13} /> : <FolderOpen size={13} />}
                  </span>
                  <span className="flex-1 text-xs text-gray-300 truncate" title={action.value}>
                    {action.value}
                  </span>
                  <button
                    type="button"
                    onClick={() => set("actions", form.actions.filter((_, j) => j !== i))}
                    className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                    title="Remover"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <select
              value={newActionType}
              onChange={(e) => setNewActionType(e.target.value as PlannedTaskAction["type"])}
              className="px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-blue-500"
            >
              <option value="open_url">URL</option>
              <option value="open_file">Arquivo</option>
            </select>
            <input
              type="text"
              value={newActionValue}
              onChange={(e) => setNewActionValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddAction();
                }
              }}
              placeholder={newActionType === "open_url" ? "https://..." : "/caminho/arquivo"}
              className="flex-1 px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleAddAction}
              disabled={!newActionValue.trim()}
              className="px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* Schedule type section */}
        {showDateFields && (
          <div className="border-t border-gray-800/60 px-3 py-2.5 flex flex-col gap-2">
            {/* Type selector: solid bg wrapper, solid active */}
            <div className="flex bg-gray-800 p-1 rounded-lg gap-1">
              {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => set("scheduleType", type)}
                  className={`flex-1 py-1 text-[11px] rounded-md transition-colors ${
                    form.scheduleType === type
                      ? "bg-blue-500 text-white"
                      : "bg-transparent text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {SCHEDULE_LABELS[type]}
                </button>
              ))}
            </div>

            {/* specific_date */}
            {form.scheduleType === "specific_date" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => set("scheduleDate", todayISO())}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
                    form.scheduleDate === todayISO()
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                      : "bg-transparent border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  Hoje
                </button>
                <DatePickerInput
                  value={form.scheduleDate}
                  onChange={(v) => set("scheduleDate", v)}
                  className="flex-1"
                />
              </div>
            )}

            {/* recurring */}
            {form.scheduleType === "recurring" && (
              <div className="flex gap-1">
                {DAY_LABELS.map((label, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleDay(idx)}
                    className={`flex-1 py-1.5 text-[11px] rounded-full border transition-colors ${
                      form.recurringDays.includes(idx)
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                        : "bg-transparent border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* period */}
            {form.scheduleType === "period" && (
              <div className="flex items-center gap-2">
                <DatePickerInput
                  value={form.periodStart}
                  onChange={(v) => set("periodStart", v)}
                  className="flex-1"
                />
                <span className="text-gray-600 text-sm shrink-0">→</span>
                <DatePickerInput
                  value={form.periodEnd}
                  onChange={(v) => set("periodEnd", v)}
                  className="flex-1"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </form>
  );
}
