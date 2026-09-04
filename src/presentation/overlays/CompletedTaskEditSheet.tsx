import { X } from "lucide-react";
import { useState } from "react";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import {
  BillableChip,
  Button,
  DatePickerInput,
  Field,
  IconButton,
  Input,
} from "@presentation/components/ui";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useDurationSync } from "@presentation/hooks/useDurationSync";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import {
  buildTaskInterval,
  formatTimeOfDay,
  localDateISO,
  resolveRegisteredEndHHMM,
} from "@shared/utils/time";

interface CompletedTaskEditSheetProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  onSave: (
    tasks: Task[],
    input: {
      name: string | null;
      projectId: string | null;
      categoryId: string | null;
      billable: boolean;
      customValues: CustomValues;
      startTime?: string;
      endTime?: string;
      durationSeconds?: number;
    }
  ) => Promise<void>;
  onClose: () => void;
}

/**
 * Edição de uma tarefa **executada** dentro do popup, sem crescer a janela —
 * mesmo desenho de painel do `PlannedTaskEditSheet`, e pela mesma razão: o
 * overlay fica onde o usuário o deixou, e uma janela que cresce ao editar sai
 * desse canto.
 *
 * A aba "Executadas" lista **grupos** (§6.3), e é o grupo que este painel edita:
 * nome, projeto, categoria e campos personalizados compõem a chave, então
 * mudá-los numa irmã só desfaria o agrupamento que o usuário está vendo. É a
 * mesma semântica do `EditGroupModal` da janela principal.
 *
 * **Os horários só aparecem no grupo de uma tarefa.** Com duas ou mais, não há
 * um intervalo a exibir — cada irmã tem o seu —, e um campo de duração sobre o
 * grupo teria de escolher entre dividir ou repetir o valor, que são duas
 * respostas erradas. Corrigir horário de uma irmã segue sendo trabalho da janela
 * principal, onde o grupo se expande.
 */
export function CompletedTaskEditSheet({
  group,
  projects,
  categories,
  onSave,
  onClose,
}: CompletedTaskEditSheetProps) {
  const first = group.tasks[0];
  const isSingle = group.tasks.length === 1;
  const { activeFields } = useCustomFields();
  const { categoriesFor } = useProjectCategoryMap();

  const [name, setName] = useState(first.name ?? "");
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === first.projectId)?.name ?? ""
  );
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === first.categoryId)?.name ?? ""
  );
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(first.projectId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(first.categoryId);
  const [billable, setBillable] = useState(first.billable);
  const [customValues, setCustomValues] = useState<CustomValues>(first.customValues);
  const [startDate, setStartDate] = useState(localDateISO(first.startTime));
  const [saving, setSaving] = useState(false);

  const categoryOptions = categoriesFor(
    categories,
    projects.find((p) => p.name === projectName)?.id ?? selectedProjectId
  );

  // Quem ancora os três campos de horário é a **duração gravada**, não o
  // instante da parada — a mesma regra do `EditTaskModal`, e o motivo está no
  // `resolveRegisteredEndHHMM`.
  const initialStart = formatTimeOfDay(first.startTime);
  const {
    startTime,
    endTime,
    durationInput,
    setDurationInput,
    handleStartChange,
    handleStartCommit,
    handleEndChange,
    handleEndCommit,
    commitDuration,
  } = useDurationSync({
    initialStart,
    initialEnd: resolveRegisteredEndHHMM(
      initialStart,
      first.durationSeconds,
      first.endTime ? formatTimeOfDay(first.endTime) : null
    ),
  });

  async function handleSave(endOverrideHHMM?: string) {
    if (saving) return;
    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    setSaving(true);
    await onSave(group.tasks, {
      name: name.trim() || null,
      projectId: pId,
      categoryId: cId,
      billable,
      customValues,
      ...(isSingle
        ? buildTaskInterval(startDate, startTime, endOverrideHHMM ?? endTime)
        : undefined),
    });
    setSaving(false);
    onClose();
  }

  useEscapeToClose(onClose);
  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    <div
      data-modal-open
      onKeyDown={handleKeyDown}
      className="absolute inset-0 z-40 flex flex-col bg-surface rounded-card overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-[37px] shrink-0 bg-raised border-b border-border">
        <span className="text-sm font-medium text-fg-secondary truncate">Editar executada</span>
        <IconButton
          icon={<X size={14} />}
          title="Cancelar"
          variant="neutral"
          size="sm"
          onClick={onClose}
        />
      </div>

      {/* Corpo rolável, como no painel da planejada: é ele que absorve os campos
          personalizados e o bloco de horário sem mexer no tamanho da janela. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 flex flex-col gap-2">
        {!isSingle && (
          <p className="text-xs text-fg-muted">
            {group.tasks.length} tarefas serão atualizadas juntas
          </p>
        )}

        <Input
          autoFocus
          size="sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da tarefa"
        />

        <Autocomplete
          value={projectName}
          onChange={setProjectName}
          onSelect={(o) => {
            setSelectedProjectId(o.id);
            // Trocar o projeto zera a categoria: o recorte de opções mudou.
            setSelectedCategoryId(null);
            setCategoryName("");
          }}
          options={projects}
          placeholder="Projeto"
          size="sm"
          className="w-full"
        />

        {/* Billable encostado na categoria, como nos demais formulários: é a
            categoria que define o padrão (§6.2), e o ajuste manual é do mesmo campo. */}
        <div className="flex items-center gap-1 pr-2 bg-raised border border-border rounded-control focus-within:border-accent transition-colors">
          <Autocomplete
            value={categoryName}
            onChange={(v) => {
              setCategoryName(v);
              const cat = categories.find((c) => c.name === v);
              if (cat) setBillable(cat.defaultBillable);
            }}
            onSelect={(o) => {
              setSelectedCategoryId(o.id);
              const cat = categories.find((c) => c.id === o.id);
              if (cat) setBillable(cat.defaultBillable);
            }}
            options={categoryOptions}
            placeholder="Categoria"
            className="flex-1 min-w-0"
            variant="bare"
            size="sm"
          />
          <BillableChip billable={billable} onToggle={() => setBillable((b) => !b)} />
        </div>

        {/* Campos personalizados antes do horário: descrevem *o que* foi feito, e
            o bloco de baixo é o que diz *quando* — a mesma ordem das duas telas
            de entrada e do painel da planejada. */}
        {activeFields.length > 0 && (
          <>
            <div className="border-t border-border-subtle mt-0.5" />
            <CustomFieldInputs
              fields={activeFields}
              values={customValues}
              onChange={setCustomValues}
              compact
            />
          </>
        )}

        {isSingle && (
          <>
            <div className="border-t border-border-subtle mt-0.5" />

            {/* Data com duração e início com fim, dois a dois: são os pares que
                o usuário corrige junto ("lancei no dia errado", "esqueci de
                parar"), a mesma dupla do `EditTaskModal`. */}
            <div className="flex gap-1.5">
              <DatePickerInput
                label="Data"
                value={startDate}
                onChange={setStartDate}
                className="flex-1 min-w-0"
              />
              <Field label="Duração" htmlFor="popup-completed-duration" className="flex-1 min-w-0">
                <Input
                  id="popup-completed-duration"
                  variant="bare"
                  size="sm"
                  value={durationInput}
                  onChange={(e) => setDurationInput(e.target.value)}
                  onBlur={commitDuration}
                  onKeyDown={(e) => {
                    // Consome porque tem trabalho próprio antes do submit: o Enter
                    // não dispara o `onBlur`, e sem o commit a tarefa seria salva
                    // com o fim antigo.
                    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
                    e.preventDefault();
                    const newEnd = commitDuration();
                    void handleSave(typeof newEnd === "string" ? newEnd : undefined);
                  }}
                  placeholder="1h30"
                  title="Aceita: 1:30, 90, 1h, 1h 30m"
                />
              </Field>
            </div>

            <div className="flex gap-1.5">
              <Field label="Início" htmlFor="popup-completed-start" className="flex-1 min-w-0">
                <Input
                  id="popup-completed-start"
                  type="time"
                  variant="bare"
                  size="sm"
                  value={startTime}
                  onChange={(e) => handleStartChange(e.target.value)}
                  onBlur={(e) => handleStartCommit(e.target.value)}
                />
              </Field>
              <Field label="Fim" htmlFor="popup-completed-end" className="flex-1 min-w-0">
                <Input
                  id="popup-completed-end"
                  type="time"
                  variant="bare"
                  size="sm"
                  value={endTime}
                  onChange={(e) => handleEndChange(e.target.value)}
                  onBlur={(e) => handleEndCommit(e.target.value)}
                />
              </Field>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1.5 px-3 h-[38px] shrink-0 border-t border-border/60">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          size="sm"
          className="ml-auto"
          loading={saving}
          onClick={() => void handleSave()}
        >
          Salvar
        </Button>
      </div>
    </div>
  );
}
