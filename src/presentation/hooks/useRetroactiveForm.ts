import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { completePlannedTask } from "@domain/usecases/plannedTasks/CompletePlannedTask";
import { DomainError } from "@shared/errors";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useDurationSync } from "@presentation/hooks/useDurationSync";
import { addDaysISO, buildLocalISO, computeEndHHMM, parseDurationInput } from "@shared/utils/time";
import { useRef, useState } from "react";

const DEFAULT_DURATION_SECS = 3600;

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * O "quê" da tarefa — tudo menos os horários. É o que a aba IA entrega pronto,
 * no lugar dos campos que o formulário lê um a um.
 */
export type RetroactiveTaskWhat = Pick<
  TaskTextInterpretation,
  "name" | "projectId" | "categoryId" | "billable" | "customValues"
>;

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

  /** O "quê" como os campos do formulário estão agora. */
  function currentWhat(): RetroactiveTaskWhat {
    return {
      name: name.trim() || null,
      projectId: projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null,
      categoryId: categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null,
      billable,
      customValues,
    };
  }

  /**
   * Grava e encadeia a próxima. `what` vem pronto da aba IA: o estado que o
   * `applyInterpretation` acabou de escrever só chega no próximo render, e lido
   * daqui sairia o da tarefa anterior. `true` = gravou.
   */
  async function handleAdd(
    overrideEndHHMM?: string,
    what: RetroactiveTaskWhat = currentWhat()
  ): Promise<boolean> {
    setError("");
    const st = startTime || prevStart.current;
    const et = overrideEndHHMM ?? (endTime || prevEnd.current);
    const startISO = buildLocalISO(selectedDate, st);
    let endISO = buildLocalISO(selectedDate, et);
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildLocalISO(addDaysISO(selectedDate, 1), et);
    }
    const durationSeconds = Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
    );

    setSaving(true);
    try {
      // O prefill da planejada não passa por `launchPlannedTaskRetroactively`:
      // depois de pré-preenchido, o usuário pode editar nome, projeto e campos, e
      // é o formulário que vale — o use case gravaria os dados da planejada.
      await createRetroactiveTask(
        taskRepo,
        {
          workspaceId,
          // Campo a campo, e não por espalhamento: o que chega da aba IA é o
          // início de tarefa do omnibox, com `startTime` e `plannedTaskId` que
          // não são deste lançamento.
          name: what.name,
          projectId: what.projectId,
          categoryId: what.categoryId,
          billable: what.billable,
          customValues: what.customValues,
          startTime: startISO,
          endTime: endISO,
          durationSeconds,
        },
        new Date().toISOString()
      );
    } catch (e) {
      // A trava de duração mínima é do domínio; a mensagem dela vai ao formulário.
      setSaving(false);
      if (e instanceof DomainError) {
        setError(e.message);
        return false;
      }
      throw e;
    }

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
    return true;
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
   * Leva a interpretação do texto para os campos do formulário. Projeto,
   * categoria e campos ficam para a próxima da cadeia, como ficam quando
   * digitados — e são o que a aba Formulário mostra se o usuário voltar a ela.
   *
   * Desfaz o vínculo com a planejada do pré-preenchimento: a tarefa agora é a
   * que o texto descreveu, e concluir aquela seria marcar feito o que não foi.
   */
  function applyInterpretation(what: RetroactiveTaskWhat) {
    prefilledPlannedTaskId.current = null;
    prefilledDate.current = null;
    setName(what.name ?? "");
    setProjectName(projects.find((p) => p.id === what.projectId)?.name ?? "");
    setSelectedProjectId(what.projectId);
    setCategoryName(categories.find((c) => c.id === what.categoryId)?.name ?? "");
    setSelectedCategoryId(what.categoryId);
    setBillable(what.billable);
    setCustomValues(what.customValues);
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
    applyInterpretation,
    advanceChainStart,
  };
}
