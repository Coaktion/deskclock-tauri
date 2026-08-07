import { useState } from "react";
import { X, DollarSign } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import {
  bareInputClass,
  boxClass,
  fieldClass,
  notchedBoxClass,
  notchedLabelClass,
} from "@presentation/components/fieldStyles";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useDurationSync } from "@presentation/hooks/useDurationSync";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { addDaysISO, resolveRegisteredEndHHMM } from "@shared/utils/time";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
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

  useEscapeToClose(onClose);

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
    await updateTask(
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
      new Date().toISOString()
    );
    void notifyTasksChanged();
    setSaving(false);
    onSave();
    onClose();
  }

  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div
        onKeyDown={handleKeyDown}
        className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-100">Editar tarefa</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        {/* Mesmo vocabulário visual do Lançamento Manual e do Planejamento
            (`fieldStyles.ts`): campo comum desenha a própria casca, e quem divide
            a linha com botão ou rótulo vive dentro de uma caixa. */}
        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (opcional)"
            autoFocus
            autoComplete="off"
            className={fieldClass}
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
                inputClassName={bareInputClass}
              />
              <button
                type="button"
                onClick={() => setBillable((b) => !b)}
                title={
                  billable
                    ? "Billable — clique para alternar"
                    : "Non-billable — clique para alternar"
                }
                className={`flex items-center gap-1 shrink-0 transition-colors ${
                  billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
                }`}
              >
                <DollarSign size={14} />
              </button>
            </div>
          </div>

          {/* Antes da data e das horas: os campos personalizados descrevem *o que*
              foi feito, e não *quando* — a mesma ordem das duas telas de entrada. */}
          <CustomFieldInputs
            fields={activeFields}
            values={customValues}
            onChange={setCustomValues}
          />

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
              <input
                id="edit-task-duration"
                type="text"
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
                autoComplete="off"
                className={`${bareInputClass} pt-3 placeholder-gray-600`}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
              <label htmlFor="edit-task-start" className={notchedLabelClass}>
                Início
              </label>
              <input
                id="edit-task-start"
                type="time"
                value={startTime}
                onChange={(e) => handleStartChange(e.target.value)}
                onBlur={(e) => handleStartCommit(e.target.value)}
                autoComplete="off"
                className={`${bareInputClass} pt-3`}
              />
            </div>
            <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
              <label htmlFor="edit-task-end" className={notchedLabelClass}>
                Fim
              </label>
              <input
                id="edit-task-end"
                type="time"
                value={endTime}
                onChange={(e) => handleEndChange(e.target.value)}
                onBlur={(e) => handleEndCommit(e.target.value)}
                autoComplete="off"
                className={`${bareInputClass} pt-3`}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
