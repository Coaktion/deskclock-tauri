import { ChevronDown, ChevronRight } from "lucide-react";

import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { WeekPlanDay } from "@domain/usecases/llm/buildWeekPlanPrompt";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import {
  BillableChip,
  FilterPill,
  Input,
  SegmentedControl,
  Select,
} from "@presentation/components/ui";
import type { WeekPlanRowDraft } from "@presentation/hooks/useWeekPlan";

/**
 * Só dias úteis, na escala do `Date` (0=Dom…6=Sáb) e **não** o índice do array —
 * a mesma tabela do `PlannedTaskForm`, e pelo mesmo motivo: `recurringDays` já
 * tem valores gravados nessa escala.
 */
const WEEKDAYS: { value: number; label: string }[] = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
];

interface WeekPlanRowProps {
  draft: WeekPlanRowDraft;
  selected: boolean;
  expanded: boolean;
  weekDays: WeekPlanDay[];
  projects: Project[];
  categories: Category[];
  categoryOptionsFor: (projectId: string | null) => Category[];
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onChange: (draft: WeekPlanRowDraft) => void;
}

/**
 * Uma proposta na lista de revisão: caixa de seleção, nome editável e, aberto, o
 * editor dos campos que o modelo pode ter errado.
 *
 * **O dia é um seletor dos dias da semana, não um calendário.** A proposta só
 * pode ocupar a semana que está na tela — é a mesma regra que o parser aplica na
 * origem —, e um campo de data livre deixaria a revisão criar o que a geração
 * não podia propor.
 */
export function WeekPlanRow({
  draft,
  selected,
  expanded,
  weekDays,
  projects,
  categories,
  categoryOptionsFor,
  onToggleSelect,
  onToggleExpand,
  onChange,
}: WeekPlanRowProps) {
  const recurringDays = draft.recurringDays ?? [];

  function toggleDay(day: number) {
    const next = recurringDays.includes(day)
      ? recurringDays.filter((d) => d !== day)
      : [...recurringDays, day].sort((a, b) => a - b);
    onChange({ ...draft, recurringDays: next });
  }

  return (
    <div className="border-b border-border-subtle last:border-0">
      <div
        className="flex items-start gap-2 px-4 py-2.5 cursor-pointer hover:bg-raised/30 transition-colors"
        onClick={onToggleExpand}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className={`mt-1 ${selectionBoxClass}`}
        />
        <div className="flex-1 min-w-0">
          <Input
            variant="plain"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="w-full min-w-0 focus:bg-raised focus:px-1 rounded-chip truncate"
          />
          <p className="text-xs text-fg-muted mt-0.5 truncate">{summaryOf(draft)}</p>
        </div>
        <span className="p-1 text-fg-muted shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>

      {expanded && (
        <div className="mt-1 mx-4 mb-2.5 space-y-1.5" onClick={(e) => e.stopPropagation()}>
          <Autocomplete
            value={draft.projectName}
            onChange={(v) => onChange({ ...draft, projectName: v, projectId: null })}
            onSelect={(o) =>
              // Trocar o projeto zera a categoria (§6.4). Só no `onSelect`: o
              // `onChange` acima dispara a cada tecla digitada.
              onChange({
                ...draft,
                projectId: o.id,
                projectName: o.name,
                categoryId: null,
                categoryName: "",
              })
            }
            options={projects}
            placeholder="Projeto"
            size="sm"
          />
          <div className="flex items-center gap-1.5">
            <Autocomplete
              value={draft.categoryName}
              onChange={(v) => onChange({ ...draft, categoryName: v, categoryId: null })}
              onSelect={(o) => {
                const category = categories.find((c) => c.id === o.id);
                // §6.2: escolher categoria preenche o faturamento com o padrão
                // dela — a mesma regra que o `planWeek` aplicou na proposta.
                onChange({
                  ...draft,
                  categoryId: o.id,
                  categoryName: o.name,
                  billable: category ? category.defaultBillable : draft.billable,
                });
              }}
              options={categoryOptionsFor(draft.projectId)}
              placeholder="Categoria"
              size="sm"
              className="flex-1 min-w-0"
            />
            <BillableChip
              billable={draft.billable}
              onToggle={() => onChange({ ...draft, billable: !draft.billable })}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-fg-muted shrink-0">Agendamento:</span>
            <SegmentedControl
              ariaLabel="Tipo de agendamento"
              value={draft.scheduleType}
              onChange={(v) =>
                onChange({
                  ...draft,
                  scheduleType: v,
                  scheduleDate:
                    v === "specific_date"
                      ? (draft.scheduleDate ?? weekDays[0]?.dateISO ?? null)
                      : null,
                  recurringDays: v === "recurring" ? (draft.recurringDays ?? []) : null,
                })
              }
              options={[
                { value: "specific_date" as const, label: "Dia único" },
                { value: "recurring" as const, label: "Recorrente" },
              ]}
            />
          </div>

          {draft.scheduleType === "specific_date" && (
            <Select
              size="sm"
              className="w-full"
              value={draft.scheduleDate ?? ""}
              onChange={(e) => onChange({ ...draft, scheduleDate: e.target.value })}
              aria-label="Dia da semana"
            >
              {weekDays.map((day) => (
                <option key={day.dateISO} value={day.dateISO}>
                  {day.weekday}
                </option>
              ))}
            </Select>
          )}

          {draft.scheduleType === "recurring" && (
            <div className="flex gap-1">
              {WEEKDAYS.map(({ value, label }) => (
                <FilterPill
                  key={value}
                  size="sm"
                  active={recurringDays.includes(value)}
                  onClick={() => toggleDay(value)}
                  className="flex-1 justify-center"
                >
                  {label}
                </FilterPill>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A linha subordinada ao nome: projeto, categoria e quando a tarefa acontece. */
function summaryOf(draft: WeekPlanRowDraft): string {
  const days = (draft.recurringDays ?? []).map(
    (day) => WEEKDAYS.find((weekday) => weekday.value === day)?.label ?? ""
  );
  const when =
    draft.scheduleType === "recurring"
      ? days.length > 0
        ? `Toda ${days.join(", ")}`
        : "Sem dia"
      : (draft.scheduleDate ?? "Sem dia");
  return [draft.projectName, draft.categoryName, when].filter((part) => part !== "").join(" · ");
}
