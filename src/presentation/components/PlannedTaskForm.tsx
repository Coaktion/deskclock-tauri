import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { ScheduleType } from "@domain/entities/PlannedTask";

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
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!form.name.trim()) return;
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
      });
      setForm({ ...INITIAL, scheduleDate: defaultDate });
      nameRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 p-4 border-b border-gray-700">
      <div className="flex gap-2">
        <input
          ref={nameRef}
          type="text"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleSubmit(); } }}
          placeholder="Nome da tarefa"
          className="flex-1 px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!form.name.trim() || submitting}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-sm transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="flex gap-2">
        <Autocomplete
          value={form.projectName}
          onChange={(v) => set("projectName", v)}
          onSelect={(o) => { set("projectId", o.id); set("projectName", o.name); }}
          options={projects}
          placeholder="Projeto"
          className="flex-1"
        />
        <Autocomplete
          value={form.categoryName}
          onChange={(v) => set("categoryName", v)}
          onSelect={(o) => {
            set("categoryId", o.id);
            set("categoryName", o.name);
            const cat = categories.find((c) => c.id === o.id);
            if (cat) set("billable", cat.defaultBillable);
          }}
          options={categories}
          placeholder="Categoria"
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => set("billable", !form.billable)}
          className={`px-2.5 py-1.5 text-xs rounded border transition-colors ${
            form.billable
              ? "bg-green-900/40 border-green-700 text-green-400"
              : "bg-gray-800 border-gray-700 text-gray-400"
          }`}
        >
          {form.billable ? "Bill." : "N/Bill."}
        </button>
      </div>

      {showDateFields && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("scheduleType", type)}
                className={`flex-1 py-1 text-xs rounded border transition-colors ${
                  form.scheduleType === type
                    ? "bg-blue-900/40 border-blue-600 text-blue-300"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {type === "specific_date" ? "Data única" : type === "recurring" ? "Recorrente" : "Período"}
              </button>
            ))}
          </div>

          {form.scheduleType === "specific_date" && (
            <DatePickerInput
              value={form.scheduleDate}
              onChange={(v) => set("scheduleDate", v)}
            />
          )}

          {form.scheduleType === "recurring" && (
            <div className="flex gap-1">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`flex-1 py-1 text-xs rounded border transition-colors ${
                    form.recurringDays.includes(idx)
                      ? "bg-blue-900/40 border-blue-600 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {form.scheduleType === "period" && (
            <div className="flex items-center gap-2">
              <DatePickerInput
                value={form.periodStart}
                onChange={(v) => set("periodStart", v)}
                className="flex-1"
              />
              <span className="text-gray-500 text-sm shrink-0">→</span>
              <DatePickerInput
                value={form.periodEnd}
                onChange={(v) => set("periodEnd", v)}
                className="flex-1"
              />
            </div>
          )}
        </div>
      )}
    </form>
  );
}
