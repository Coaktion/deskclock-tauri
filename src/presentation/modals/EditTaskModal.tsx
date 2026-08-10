import { useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { boxClass, notchedBoxClass, notchedLabelClass } from "@presentation/components/fieldStyles";
import { BillableChip, Button, Input, Modal } from "@presentation/components/ui";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useDurationSync } from "@presentation/hooks/useDurationSync";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { setGroupBillable } from "@domain/usecases/tasks/SetGroupBillable";
import { addDaysISO, resolveRegisteredEndHHMM } from "@shared/utils/time";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface EditTaskModalProps {
  task: Task;
  projects: Project[];
  categories: Category[];
  onSave: () => void;
  onClose: () => void;
}

function localDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function EditTaskModal({ task, projects, categories, onSave, onClose }: EditTaskModalProps) {
  const { taskRepo } = useRepositories();
  const [name, setName] = useState(task.name ?? "");
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(task.projectId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(task.categoryId);
  const { activeFields } = useCustomFields();
  const [customValues, setCustomValues] = useState<CustomValues>(task.customValues);
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(
    categories,
    projects.find((p) => p.name === projectName)?.id ?? selectedProjectId
  );

  // Data de início (local) como referência para construir os ISOs
  const [startDate, setStartDate] = useState(localDateISO(task.startTime));

  // Início, fim e duração são mantidos em sincronia pelo hook compartilhado, e
  // quem ancora os três é a duração gravada (`resolveRegisteredEndHHMM`): o fim
  // exibido é o que fecha a conta com ela, não o instante da parada. Salvar
  // grava esse fim, deixando o registro coerente — o preço é perder o instante
  // real da parada de uma tarefa arredondada ou pausada, e foi escolhido em
  // troca de os três campos nunca se contradizerem na tela.
  const initialStart = isoToHHMM(task.startTime);
  const initialEnd = resolveRegisteredEndHHMM(
    initialStart,
    task.durationSeconds,
    task.endTime ? isoToHHMM(task.endTime) : null
  );
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
  } = useDurationSync({ initialStart, initialEnd });

  const [saving, setSaving] = useState(false);

  async function handleSave(endOverrideHHMM?: string) {
    if (saving) return;
    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    const startISO = buildISO(startDate, startTime);
    const et = endOverrideHHMM ?? endTime;
    let endISO = buildISO(startDate, et);
    // Se hora fim for anterior à hora início, consideramos que passou da meia-noite
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildISO(addDaysISO(startDate, 1), et);
    }
    const durationSeconds = Math.max(
      0,
      Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000)
    );

    setSaving(true);
    const nowISO = new Date().toISOString();
    const updated = await updateTask(
      taskRepo,
      task.id,
      {
        name: name.trim() || null,
        projectId: pId,
        categoryId: cId,
        billable,
        startTime: startISO,
        endTime: endISO,
        durationSeconds,
        customValues,
      },
      nowISO
    );
    // O modal edita uma tarefa, mas faturamento é do grupo: o chip daqui deixava
    // a irmã com o valor antigo, e a trava do chip da lista não alcança este
    // caminho. Vale o que o modal salvou — inclusive quando a edição mudou o
    // nome e a tarefa passou a pertencer a outro grupo, cujo valor ela leva
    // consigo. Grupo já uniforme não gera escrita nenhuma.
    await setGroupBillable(taskRepo, updated, billable, nowISO);
    void notifyTasksChanged();
    setSaving(false);
    onSave();
    onClose();
  }

  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    // Mesmo vocabulário visual do Lançamento Manual e do Planejamento
    // (`fieldStyles.ts`): campo comum desenha a própria casca, e quem divide a
    // linha com botão ou rótulo vive dentro de uma caixa.
    <Modal
      title="Editar tarefa"
      onClose={onClose}
      onKeyDown={handleKeyDown}
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
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome (opcional)"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2">
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
        />
        {/* Categoria e billable leem como um campo só, como nas duas telas de
            entrada: a caixa desenha a borda e o toggle mora dentro dela. */}
        <div className={`${boxClass} flex items-center pr-2`}>
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
          />
          <BillableChip billable={billable} onToggle={() => setBillable((b) => !b)} />
        </div>
      </div>

      {/* Antes da data e das horas: os campos personalizados descrevem *o que*
              foi feito, e não *quando* — a mesma ordem das duas telas de entrada. */}
      <CustomFieldInputs fields={activeFields} values={customValues} onChange={setCustomValues} />

      {/* Data e duração dividem a linha: são os dois campos que o usuário
              costuma corrigir junto ("lancei no dia errado", "esqueci de parar"). */}
      <div className="flex gap-2">
        <DatePickerInput
          label="Data"
          value={startDate}
          onChange={setStartDate}
          className="flex-1"
        />
        <div className={`${boxClass} ${notchedBoxClass} w-32 shrink-0`}>
          <label htmlFor="edit-task-duration" className={notchedLabelClass}>
            Duração
          </label>
          <Input
            id="edit-task-duration"
            variant="bare"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => {
              // Consome porque tem trabalho próprio antes do submit: o Enter
              // não dispara o `onBlur`, e sem commit a tarefa seria salva
              // com o fim antigo.
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              const newEnd = commitDuration();
              void handleSave(typeof newEnd === "string" ? newEnd : undefined);
            }}
            placeholder="1h30, 90, 1h…"
            title="Aceita: 1:30, 90, 1h, 1h 30m"
            className="pt-3"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
          <label htmlFor="edit-task-start" className={notchedLabelClass}>
            Início
          </label>
          <Input
            id="edit-task-start"
            type="time"
            variant="bare"
            value={startTime}
            onChange={(e) => handleStartChange(e.target.value)}
            onBlur={(e) => handleStartCommit(e.target.value)}
            className="pt-3"
          />
        </div>
        <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
          <label htmlFor="edit-task-end" className={notchedLabelClass}>
            Fim
          </label>
          <Input
            id="edit-task-end"
            type="time"
            variant="bare"
            value={endTime}
            onChange={(e) => handleEndChange(e.target.value)}
            onBlur={(e) => handleEndCommit(e.target.value)}
            className="pt-3"
          />
        </div>
      </div>
    </Modal>
  );
}
