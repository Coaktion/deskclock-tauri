import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import { todayISO } from "@shared/utils/time";
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
            className="w-full bg-transparent text-sm text-gray-100 placeholder-gray-500 focus:outline-none"
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
                set("categoryId", o.id);
                set("categoryName", o.name);
                const cat = categories.find((c) => c.id === o.id);
                if (cat) set("billable", cat.defaultBillable);
              }}
              options={categories}
              placeholder="Categoria"
              className=""
            />
          </div>
          <button
            type="submit"
            disabled={!form.name.trim() || submitting}
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
          >
            <Plus size={12} />
            Adicionar
          </button>
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
