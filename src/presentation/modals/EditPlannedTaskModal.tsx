import type { PlannedTask, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { PlannedActionsField } from "@presentation/components/PlannedActionsField";
import { boxClass } from "@presentation/components/fieldStyles";
import { BillableChip, Button, DatePickerInput, Input, Modal } from "@presentation/components/ui";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import {
  usePlannedTaskEditor,
  type EditPlannedTaskInput,
} from "@presentation/hooks/usePlannedTaskEditor";
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
    setActions,
    customValues,
    setCustomValues,
    saving,
    save: handleSave,
  } = usePlannedTaskEditor({ task, projects, categories, onSave, onClose });

  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    // `lg` (720) e não `xl`: é formulário, e a grade de duas colunas é a medida
    // que ele pede. Eram 672 px em `max-w-2xl`, fora das quatro larguras.
    <Modal
      title="Editar tarefa planejada"
      size="lg"
      onClose={onClose}
      onKeyDown={handleKeyDown}
      bodyClassName="p-5 flex flex-col gap-6"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      {/* Mesmo vocabulário visual do `EditTaskModal` e das duas telas de entrada
          (`fieldStyles.ts`): campo comum desenha a própria casca, e quem divide
          a linha com um botão vive dentro de uma caixa. */}
      <div className="flex flex-col gap-3">
        <p className="text-overline uppercase text-fg-muted">Tarefa</p>
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da tarefa"
        />
        <div className="grid grid-cols-2 gap-2">
          <Autocomplete
            value={projectName}
            onChange={setProjectName}
            onSelect={selectProject}
            options={projects}
            placeholder="Projeto"
          />
          {/* Billable encostado na categoria, como no popup e nas duas telas de
              entrada: é a categoria que define o padrão (§6.2), e o ajuste
              manual pertence ao mesmo campo. */}
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
            <BillableChip billable={billable} onToggle={() => setBillable((b) => !b)} />
          </div>
        </div>

        {/* Campos personalizados logo depois de categoria e billable, antes do
            agendamento (§5.1.2): são atributos do trabalho em si, e o
            agendamento é o bloco que diz *quando* — intercalá-los partia os dois
            grupos ao meio. */}
        <CustomFieldInputs fields={activeFields} values={customValues} onChange={setCustomValues} />
      </div>

      <div className="border-t border-border-subtle" />

      <div className="flex flex-col gap-3">
        <p className="text-overline uppercase text-fg-muted">Agendamento</p>
        {/* Alternância em `accent`/`secondary`, a mesma língua do botão
            "Filtros" e do `FilterPill` aceso. Não é `SegmentedControl`: ele é
            uma faixa compacta de pílulas, e estes três ocupam a linha inteira. */}
        <div className="flex gap-2">
          {(["specific_date", "recurring", "period"] as ScheduleType[]).map((type) => (
            <Button
              key={type}
              variant={scheduleType === type ? "accent" : "secondary"}
              onClick={() => setScheduleType(type)}
              className="flex-1"
            >
              {type === "specific_date"
                ? "Data única"
                : type === "recurring"
                  ? "Recorrente"
                  : "Período"}
            </Button>
          ))}
        </div>

        {/* Sem botão "Hoje": quem abre em hoje é o próprio campo, quando a
            tarefa não tem data gravada (`usePlannedTaskEditor`). O botão dizia
            duas coisas ao mesmo tempo — "a data é hoje" e "leve a data para
            hoje" — e o estado aceso lia como um filtro. */}
        {scheduleType === "specific_date" && (
          <DatePickerInput value={scheduleDate} onChange={setScheduleDate} className="w-full" />
        )}

        {scheduleType === "recurring" && (
          <div className="flex gap-2">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                title={day.title}
                variant={recurringDays.includes(day.value) ? "accent" : "secondary"}
                onClick={() => toggleDay(day.value)}
                className="flex-1"
              >
                {day.label}
              </Button>
            ))}
          </div>
        )}

        {scheduleType === "period" && (
          <div className="flex items-center gap-3">
            <DatePickerInput value={periodStart} onChange={setPeriodStart} className="flex-1" />
            <span className="text-fg-muted text-sm shrink-0">→</span>
            <DatePickerInput
              value={periodEnd}
              onChange={setPeriodEnd}
              className="flex-1"
              clearable
            />
          </div>
        )}
      </div>

      <div className="border-t border-border-subtle" />

      <div className="flex flex-col gap-3">
        <p className="text-overline uppercase text-fg-muted">Ações ao iniciar</p>

        <PlannedActionsField actions={actions} onChange={setActions} />
      </div>
    </Modal>
  );
}
