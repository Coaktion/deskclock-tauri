import { useCallback, useEffect, useState } from "react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
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
    const [hh, mm] = startTimeInput.split(":").map(Number);
    if (isNaN(hh) || isNaN(mm)) return;
    const base = new Date(runningTask.startTime);
    base.setHours(hh, mm, 0, 0);
    if (base > new Date()) return;
    await updateActiveTask({ startTime: base.toISOString() });
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

  // useState setters are stable — [] is correct here
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
    editingStartTime,
    startTimeInput,
    setStartTimeInput,
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
    resetEditing,
  };
}

export type OmniboxRunningEditState = ReturnType<typeof useOmniboxRunningEdit>;
