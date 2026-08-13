import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { PlannedActionsField } from "@presentation/components/PlannedActionsField";
import { BillableChip, Field, FilterPill, Input } from "@presentation/components/ui";
import { formColumnClass } from "@presentation/components/fieldStyles";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { todayISO } from "@shared/utils/time";
import { useRef, useState } from "react";

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
  customValues: CustomValues;
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
  customValues: {},
};

/**
 * Só dias úteis — o fim de semana saiu do planejamento. O número é o dia da
 * semana como o `Date` o entende (0=Dom … 6=Sáb) e **não** o índice do array:
 * `recurringDays` já tem valores gravados nessa escala.
 */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
];

const SCHEDULE_LABELS: Record<ScheduleType, string> = {
  specific_date: "Data",
  recurring: "Recorrente",
  period: "Período",
};

/** Título das seções que quebram a coluna em blocos (Ações, Agendamento). */
const sectionLabelClass =
  "text-overline uppercase text-fg-muted pt-1 border-t border-border-subtle";

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
    customValues: CustomValues;
  }) => Promise<void>;
}

/**
 * Coluna de criação da tela de Planejamento. Espelha a do Lançamento Manual —
 * mesma largura, mesmo vocabulário de campo — porque as duas telas fazem a
 * mesma coisa com dados quase iguais, e vê-las diferentes fazia parecer que
 * funcionavam diferente.
 *
 * As seções de ações e de agendamento não têm equivalente no Manual e são o que
 * espreme a coluna — os dias da recorrência são a linha mais apertada.
 */
export function PlannedTaskForm({
  projects,
  categories,
  showDateFields = false,
  defaultDate = "",
  onSubmit,
}: PlannedTaskFormProps) {
  const [form, setForm] = useState<FormState>({ ...INITIAL, scheduleDate: defaultDate });
  const { activeFields } = useCustomFields();
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, form.projectId);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const handleKeyDown = useSubmitOnEnter(() => void handleSubmit());

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  /**
   * Trocar ou limpar o projeto zera a categoria — o recorte de categorias mudou
   * debaixo dela, e manter a anterior deixaria escolhida uma opção que o campo
   * já não oferece. Chamado só nos dois caminhos em que o projeto de fato muda
   * de id, nunca a cada tecla digitada.
   */
  function clearCategory() {
    setForm((prev) => ({ ...prev, categoryId: null, categoryName: "" }));
  }

  function toggleDay(day: number) {
    setForm((prev) => {
      const days = prev.recurringDays.includes(day)
        ? prev.recurringDays.filter((d) => d !== day)
        : [...prev.recurringDays, day].sort();
      return { ...prev, recurringDays: days };
    });
  }

  // Só é "invertido" com as duas datas preenchidas: enquanto falta uma, o
  // período está incompleto, não errado — e pintar de vermelho quem ainda está
  // digitando acusa um erro que a pessoa não cometeu.
  const isPeriodInverted =
    form.scheduleType === "period" &&
    !!form.periodStart &&
    !!form.periodEnd &&
    form.periodEnd < form.periodStart;

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
        customValues: form.customValues,
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
    // O `onKeyDown` não é redundante com o `onSubmit`: o submit implícito do
    // navegador cobriria só parte dos campos, e é ele que o hook cancela para o
    // Enter ter uma regra só em todo o app (`useSubmitOnEnter`).
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className={formColumnClass}>
      <Field label="Nome" htmlFor="planned-name">
        <Input
          id="planned-name"
          ref={nameRef}
          variant="bare"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Nome da tarefa"
        />
      </Field>

      <Field label="Projeto" htmlFor="planned-project">
        <Autocomplete
          id="planned-project"
          value={form.projectName}
          onChange={(v) => {
            set("projectName", v);
            if (!v) {
              set("projectId", null);
              clearCategory();
            }
          }}
          onSelect={(o) => {
            set("projectId", o.id);
            set("projectName", o.name);
            clearCategory();
          }}
          options={projects}
          placeholder="Buscar projeto…"
          variant="bare"
        />
      </Field>

      <Field label="Categoria" htmlFor="planned-category" boxClassName="flex items-center pr-2">
        <Autocomplete
          id="planned-category"
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
          options={categoryOptions}
          placeholder="Buscar categoria…"
          className="flex-1"
          variant="bare"
        />
        <BillableChip billable={form.billable} onToggle={() => set("billable", !form.billable)} />
      </Field>

      <CustomFieldInputs
        fields={activeFields}
        values={form.customValues}
        onChange={(values) => set("customValues", values)}
        compact
        className="space-y-3"
      />

      {/* ── Agendamento ─────────────────────────────────────────────────────── */}
      {showDateFields && (
        <>
          <p className={sectionLabelClass}>Agendamento</p>

          <div className="flex bg-raised p-1 rounded-control gap-1">
            {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("scheduleType", type)}
                className={`flex-1 py-1 text-sm font-medium rounded-chip transition-colors ${
                  form.scheduleType === type
                    ? "bg-accent text-white"
                    : "bg-transparent text-fg-muted hover:text-fg"
                }`}
              >
                {SCHEDULE_LABELS[type]}
              </button>
            ))}
          </div>

          {form.scheduleType === "specific_date" && (
            <div className="flex items-center gap-2">
              <FilterPill
                size="sm"
                active={form.scheduleDate === todayISO()}
                onClick={() => set("scheduleDate", todayISO())}
              >
                Hoje
              </FilterPill>
              <DatePickerInput
                value={form.scheduleDate}
                onChange={(v) => set("scheduleDate", v)}
                className="flex-1"
              />
            </div>
          )}

          {form.scheduleType === "recurring" && (
            <div className="flex gap-1">
              {WEEKDAYS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-full border transition-colors ${
                    form.recurringDays.includes(value)
                      ? "bg-accent/10 border-accent/40 text-accent-text"
                      : "bg-transparent border-border text-fg-muted hover:border-fg-muted hover:text-fg"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {form.scheduleType === "period" && (
            <div className="space-y-2">
              <DatePickerInput
                value={form.periodStart}
                onChange={(v) => set("periodStart", v)}
                className="w-full"
              />
              <DatePickerInput
                value={form.periodEnd}
                onChange={(v) => set("periodEnd", v)}
                className="w-full"
                invalid={isPeriodInverted}
              />
              {isPeriodInverted && (
                <p className="text-xs text-danger">O fim não pode ser antes do início.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Ações ao iniciar ────────────────────────────────────────────────── */}
      <p className={sectionLabelClass}>Ações ao iniciar</p>

      <PlannedActionsField
        actions={form.actions}
        onChange={(actions) => set("actions", actions)}
        compact
      />

      <button
        type="submit"
        disabled={!form.name.trim() || !isScheduleValid() || submitting}
        className="w-full px-4 py-1.5 text-sm font-medium bg-accent hover:opacity-90 disabled:opacity-40 text-white rounded-control transition-opacity"
      >
        Adicionar
      </button>
    </form>
  );
}
