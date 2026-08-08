import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import {
  bareInputClass,
  boxClass,
  fieldClass,
  formColumnClass,
} from "@presentation/components/fieldStyles";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { todayISO } from "@shared/utils/time";
import { DollarSign, ExternalLink, FolderOpen, Plus, Trash2 } from "lucide-react";
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
  "text-xs font-medium text-gray-500 uppercase tracking-wide pt-1 border-t border-gray-800";

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
  const [newActionType, setNewActionType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newActionValue, setNewActionValue] = useState("");
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

  function handleAddAction() {
    const value = newActionValue.trim();
    if (!value) return;
    set("actions", [...form.actions, { type: newActionType, value }]);
    setNewActionValue("");
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
      <input
        ref={nameRef}
        type="text"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Nome da tarefa"
        autoComplete="off"
        className={fieldClass}
      />

      <Autocomplete
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
        placeholder="Projeto"
      />

      <div className={`${boxClass} flex items-center pr-2`}>
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
          options={categoryOptions}
          placeholder="Categoria"
          className="flex-1"
          inputClassName={bareInputClass}
        />
        <button
          type="button"
          onClick={() => set("billable", !form.billable)}
          title={
            form.billable
              ? "Billable — clique para alternar"
              : "Non-billable — clique para alternar"
          }
          className={`flex items-center gap-1 shrink-0 transition-colors ${
            form.billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <DollarSign size={14} />
        </button>
      </div>

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

          <div className="flex bg-gray-800 p-1 rounded-lg gap-1">
            {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => set("scheduleType", type)}
                className={`flex-1 py-1 text-xs rounded-md transition-colors ${
                  form.scheduleType === type
                    ? "bg-blue-500 text-white"
                    : "bg-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                {SCHEDULE_LABELS[type]}
              </button>
            ))}
          </div>

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

          {form.scheduleType === "recurring" && (
            <div className="flex gap-1">
              {WEEKDAYS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => toggleDay(value)}
                  className={`flex-1 py-1.5 text-xs rounded-full border transition-colors ${
                    form.recurringDays.includes(value)
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                      : "bg-transparent border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
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
                <p className="text-xs text-red-400">O fim não pode ser antes do início.</p>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Ações ao iniciar ────────────────────────────────────────────────── */}
      <p className={sectionLabelClass}>Ações ao iniciar</p>

      {form.actions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {form.actions.map((action, i) => (
            <li key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-800 rounded-lg">
              <span
                className={`shrink-0 ${action.type === "open_url" ? "text-blue-400" : "text-purple-400"}`}
              >
                {action.type === "open_url" ? <ExternalLink size={13} /> : <FolderOpen size={13} />}
              </span>
              <span className="flex-1 text-xs text-gray-300 truncate" title={action.value}>
                {action.value}
              </span>
              <button
                type="button"
                onClick={() =>
                  set(
                    "actions",
                    form.actions.filter((_, j) => j !== i)
                  )
                }
                className="shrink-0 text-gray-600 hover:text-red-400 transition-colors"
                title="Remover"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <select
        value={newActionType}
        onChange={(e) => setNewActionType(e.target.value as PlannedTaskAction["type"])}
        className="w-full px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-300 focus:outline-none focus:border-blue-500"
      >
        <option value="open_url">URL</option>
        <option value="open_file">Arquivo</option>
      </select>

      <div className={`${boxClass} flex items-center pr-1`}>
        <input
          type="text"
          value={newActionValue}
          onChange={(e) => setNewActionValue(e.target.value)}
          onKeyDown={(e) => {
            // Sub-formulário: aqui o Enter adiciona a ação, não cria a tarefa.
            // O `preventDefault` é o que avisa isso ao `useSubmitOnEnter`.
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            handleAddAction();
          }}
          placeholder={newActionType === "open_url" ? "https://..." : "/caminho/arquivo"}
          autoComplete="off"
          className={`${bareInputClass} text-xs`}
        />
        <button
          type="button"
          onClick={handleAddAction}
          disabled={!newActionValue.trim()}
          title="Adicionar ação"
          className="shrink-0 p-1 text-gray-500 hover:text-gray-200 disabled:opacity-40 disabled:hover:text-gray-500 transition-colors"
        >
          <Plus size={14} />
        </button>
      </div>

      <button
        type="submit"
        disabled={!form.name.trim() || !isScheduleValid() || submitting}
        className="w-full px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg text-sm transition-colors"
      >
        Adicionar
      </button>
    </form>
  );
}
