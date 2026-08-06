import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useDurationSync } from "@presentation/hooks/useDurationSync";
import { addDaysISO, computeEndHHMM, parseDurationInput } from "@shared/utils/time";
import { useRef, useState } from "react";

const DEFAULT_DURATION_SECS = 3600;

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface UseRetroactiveFormOptions {
  selectedDate: string;
  projects: Project[];
  categories: Category[];
  onTaskAdded: () => Promise<void>;
}

export function useRetroactiveForm({
  selectedDate,
  projects,
  categories,
  onTaskAdded,
}: UseRetroactiveFormOptions) {
  const { taskRepo, plannedTaskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [billable, setBillable] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Persistem entre lançamentos da cadeia, como projeto e categoria: entradas
  // consecutivas do mesmo dia costumam compartilhar o mesmo valor.
  const [customValues, setCustomValues] = useState<CustomValues>({});

  const initialStart = nowHHMM();
  const {
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    durationInput,
    setDurationInput,
    prevStart,
    prevEnd,
    handleStartChange,
    handleStartCommit,
    handleEndChange,
    handleEndCommit,
    commitDuration,
  } = useDurationSync({
    initialStart,
    initialEnd: computeEndHHMM(initialStart, DEFAULT_DURATION_SECS),
    onChange: () => setError(""),
  });

  const nameRef = useRef<HTMLInputElement>(null);
  // Vínculo com a tarefa planejada que originou o prefill. Consumido (e zerado)
  // ao adicionar, para marcá-la como concluída sem vazar para a próxima da cadeia.
  // A data do prefill é guardada para não marcar a planejada no dia errado caso
  // o usuário troque a data antes de adicionar.
  const prefilledPlannedTaskId = useRef<string | null>(null);
  const prefilledDate = useRef<string | null>(null);

  async function handleAdd(overrideEndHHMM?: string) {
    setError("");
    const st = startTime || prevStart.current;
    const et = overrideEndHHMM ?? (endTime || prevEnd.current);
    const startISO = buildISO(selectedDate, st);
    let endISO = buildISO(selectedDate, et);
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildISO(addDaysISO(selectedDate, 1), et);
    }
    const durationSeconds = Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
    );
    if (durationSeconds < 60) {
      setError("A duração mínima é 1 minuto.");
      return;
    }

    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    setSaving(true);
    await createRetroactiveTask(
      taskRepo,
      {
        workspaceId,
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

    // Se a tarefa veio de uma planejada (prefill) e a data não mudou, marca-a
    // como concluída no dia. O vínculo é sempre zerado após a tentativa para não
    // vazar para a próxima tarefa da cadeia.
    if (prefilledPlannedTaskId.current && prefilledDate.current === selectedDate) {
      await completePlannedTask(plannedTaskRepo, prefilledPlannedTaskId.current, selectedDate);
    }
    prefilledPlannedTaskId.current = null;
    prefilledDate.current = null;
    void notifyTasksChanged();
    setSaving(false);

    // Encadeia: próximo início = fim anterior, mantém mesma duração
    const nextStart = isoToHHMM(endISO);
    const nextEnd = computeEndHHMM(nextStart, durationSeconds);
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    setName("");
    setStartTime(nextStart);
    setEndTime(nextEnd);
    prevStart.current = nextStart;
    prevEnd.current = nextEnd;
    setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    nameRef.current?.focus();
    await onTaskAdded();
  }

  function prefill(task: PlannedTask) {
    prefilledPlannedTaskId.current = task.id;
    prefilledDate.current = selectedDate;
    setName(task.name);
    const project = projects.find((p) => p.id === task.projectId);
    const category = categories.find((c) => c.id === task.categoryId);
    setProjectName(project?.name ?? "");
    setSelectedProjectId(task.projectId);
    setCategoryName(category?.name ?? "");
    setSelectedCategoryId(task.categoryId);
    setBillable(task.billable);
    setCustomValues(task.customValues);
    nameRef.current?.focus();
  }

  /**
   * Zera a categoria ao trocar de projeto. Vive aqui, e não num `useEffect`
   * keyed em `selectedProjectId`, porque `prefill` preenche projeto e categoria
   * **juntos**: um efeito apagaria a categoria que acabou de chegar ao lado
   * dela. Quem chama é o `onSelect` do autocomplete de projeto — escolha de
   * verdade —, nunca o `onChange`, que dispara a cada tecla.
   */
  function clearCategory() {
    setCategoryName("");
    setSelectedCategoryId(null);
  }

  function advanceChainStart(newStartHHMM: string) {
    const durSecs = parseDurationInput(durationInput) ?? DEFAULT_DURATION_SECS;
    const newEnd = computeEndHHMM(newStartHHMM, durSecs);
    const h = Math.floor(durSecs / 3600);
    const m = Math.floor((durSecs % 3600) / 60);
    setStartTime(newStartHHMM);
    setEndTime(newEnd);
    prevStart.current = newStartHHMM;
    prevEnd.current = newEnd;
    setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  return {
    nameRef,
    prevStart,
    prevEnd,
    name,
    setName,
    projectName,
    setProjectName,
    categoryName,
    setCategoryName,
    billable,
    setBillable,
    customValues,
    setCustomValues,
    selectedProjectId,
    setSelectedProjectId,
    setSelectedCategoryId,
    clearCategory,
    startTime,
    endTime,
    durationInput,
    setDurationInput,
    error,
    saving,
    handleStartChange,
    handleStartCommit,
    handleEndChange,
    handleEndCommit,
    commitDuration,
    handleAdd,
    prefill,
    advanceChainStart,
  };
}
