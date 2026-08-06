import { useCallback, useEffect, useState } from "react";
import { parseStartTimeInput } from "@shared/utils/time";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";

interface UseOmniboxRunningEditParams {
  runningTask: Task | null;
  projects: Project[];
  categories: Category[];
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
  updateActiveTask: RunningTaskContextValue["updateActiveTask"];
  stopTask: RunningTaskContextValue["stopTask"];
  pauseTask: RunningTaskContextValue["pauseTask"];
  resumeTask: RunningTaskContextValue["resumeTask"];
}

export function useOmniboxRunningEdit({
  runningTask,
  projects,
  categories,
  focusTaskEdit,
  onFocusTaskEditHandled,
  updateActiveTask,
  stopTask,
  pauseTask,
  resumeTask,
}: UseOmniboxRunningEditParams) {
  const [confirmingStop, setConfirmingStop] = useState(false);
  const [editingRunningChip, setEditingRunningChip] = useState<"project" | "category" | null>(null);
  const [runningChipValue, setRunningChipValue] = useState("");
  const [editingRunningName, setEditingRunningName] = useState(false);
  const [runningNameValue, setRunningNameValue] = useState("");
  const [fillingRequired, setFillingRequired] = useState(false);
  const [fillName, setFillName] = useState("");
  const [fillProjectName, setFillProjectName] = useState("");
  const [fillProjectId, setFillProjectId] = useState<string | null>(null);
  const [fillCategoryName, setFillCategoryName] = useState("");
  const [fillCategoryId, setFillCategoryId] = useState<string | null>(null);
  const [editingStartTime, setEditingStartTime] = useState(false);
  const [startTimeInput, setStartTimeInput] = useState("");
  const [editingCustomFields, setEditingCustomFields] = useState(false);

  useEffect(() => {
    if (!focusTaskEdit || !runningTask) return;
    if (!runningTask.projectId) {
      setRunningChipValue("");
      setEditingRunningChip("project");
    } else if (!runningTask.categoryId) {
      setRunningChipValue("");
      setEditingRunningChip("category");
    }
    onFocusTaskEditHandled?.();
  }, [focusTaskEdit, runningTask, onFocusTaskEditHandled]);

  // Painel aberto pertence à tarefa que estava em execução: sem este reset, parar
  // uma tarefa com ele aberto faria a próxima nascer com os campos de outra
  // expostos, e o `Salvar` gravaria valores que o usuário digitou para a antiga.
  useEffect(() => {
    setEditingCustomFields(false);
  }, [runningTask?.id]);

  const isRunning = runningTask?.status === "running";

  async function handlePlayPause() {
    if (isRunning) await pauseTask();
    else await resumeTask();
  }

  function handleStopClick() {
    if (!runningTask) return;
    if (!runningTask.name?.trim() || !runningTask.projectId || !runningTask.categoryId) {
      setFillName(runningTask.name ?? "");
      setFillProjectName(projects.find((p) => p.id === runningTask.projectId)?.name ?? "");
      setFillProjectId(runningTask.projectId);
      setFillCategoryName(categories.find((c) => c.id === runningTask.categoryId)?.name ?? "");
      setFillCategoryId(runningTask.categoryId);
      setFillingRequired(true);
    } else {
      setConfirmingStop(true);
    }
  }

  /** Trocar o projeto no preenchimento obrigatório zera a categoria já digitada. */
  function clearFillCategory() {
    setFillCategoryName("");
    setFillCategoryId(null);
  }

  async function handleFillSubmit() {
    const pId = projects.find((p) => p.name === fillProjectName)?.id ?? fillProjectId ?? null;
    const cId = categories.find((c) => c.name === fillCategoryName)?.id ?? fillCategoryId ?? null;
    await updateActiveTask({ name: fillName.trim() || null, projectId: pId, categoryId: cId });
    setFillingRequired(false);
    setConfirmingStop(true);
  }

  async function handleStopConfirm(completed: boolean) {
    setConfirmingStop(false);
    await stopTask(completed);
  }

  async function handleNameCommit() {
    setEditingRunningName(false);
    await updateActiveTask({ name: runningNameValue.trim() || null });
  }

  function handleStartTimeClick() {
    if (!runningTask) return;
    const d = new Date(runningTask.startTime);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    setStartTimeInput(`${hh}:${mm}`);
    setEditingStartTime(true);
  }

  async function handleStartTimeCommit() {
    setEditingStartTime(false);
    if (!runningTask) return;
    const newISO = parseStartTimeInput(startTimeInput, runningTask.startTime);
    if (!newISO) return;
    await updateActiveTask({ startTime: newISO });
  }

  async function handleProjectSelect(projectId: string) {
    await updateActiveTask({ projectId });
    setEditingRunningChip(null);
  }

  async function handleCategorySelect(categoryId: string, billable: boolean) {
    await updateActiveTask({ categoryId, billable });
    setEditingRunningChip(null);
  }

  async function handleBillableToggle(currentBillable: boolean) {
    await updateActiveTask({ billable: !currentBillable });
  }

  async function handleCustomValuesSave(customValues: CustomValues) {
    await updateActiveTask({ customValues });
  }

  // useState setters are stable — [] is correct here.
  //
  // O painel de campos personalizados **não** fecha aqui de propósito: os chips
  // guardam uma escolha atômica que se refaz num clique, e o painel guarda texto
  // digitado. Fechá-lo no clique fora jogaria fora o que ninguém salvou.
  const resetEditing = useCallback(() => {
    setEditingRunningChip(null);
  }, []);

  return {
    confirmingStop,
    setConfirmingStop,
    editingRunningChip,
    setEditingRunningChip,
    runningChipValue,
    setRunningChipValue,
    editingRunningName,
    setEditingRunningName,
    runningNameValue,
    setRunningNameValue,
    fillingRequired,
    setFillingRequired,
    fillName,
    setFillName,
    fillProjectName,
    setFillProjectName,
    fillProjectId,
    fillCategoryName,
    setFillCategoryName,
    fillCategoryId,
    clearFillCategory,
    editingStartTime,
    startTimeInput,
    setStartTimeInput,
    editingCustomFields,
    setEditingCustomFields,
    isRunning,
    handlePlayPause,
    handleStopClick,
    handleFillSubmit,
    handleStopConfirm,
    handleNameCommit,
    handleStartTimeClick,
    handleStartTimeCommit,
    handleProjectSelect,
    handleCategorySelect,
    handleBillableToggle,
    handleCustomValuesSave,
    resetEditing,
  };
}

export type OmniboxRunningEditState = ReturnType<typeof useOmniboxRunningEdit>;
