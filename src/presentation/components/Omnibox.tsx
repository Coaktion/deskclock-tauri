import { useCallback, useEffect, useRef } from "react";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";
import { useOmniboxRunningEdit } from "@presentation/hooks/useOmniboxRunningEdit";
import { OmniboxIdle } from "./OmniboxIdle";
import { OmniboxRunning } from "./OmniboxRunning";

interface OmniboxProps {
  plannedTasks: PlannedTask[];
  /** O dia de que a lista de sugestões é recortada. */
  today: string;
  projects: Project[];
  categories: Category[];
  onStarted?: () => void;
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
  onTogglePlannedBillable: (task: PlannedTask) => void;
  onNavigatePlanning?: () => void;
}

export function Omnibox({
  plannedTasks,
  today,
  projects,
  categories,
  onStarted,
  focusTaskEdit,
  onFocusTaskEditHandled,
  onTogglePlannedBillable,
  onNavigatePlanning,
}: OmniboxProps) {
  const {
    runningTask,
    activePlannedTaskId,
    startTask,
    pauseTask,
    resumeTask,
    stopTask,
    cancelTask,
    updateActiveTask,
  } = useRunningTask();
  const seconds = useTaskTimer(runningTask);
  const containerRef = useRef<HTMLDivElement>(null);

  const draft = useOmniboxDraft({ plannedTasks, today, startTask, onStarted });

  const edit = useOmniboxRunningEdit({
    runningTask,
    projects,
    categories,
    focusTaskEdit,
    onFocusTaskEditHandled,
    updateActiveTask,
    stopTask,
    pauseTask,
    resumeTask,
  });

  // Stable refs to reset functions so the effect only registers once
  const resetDraft = draft.reset;
  const resetEditing = edit.resetEditing;

  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        resetDraft();
        resetEditing();
      }
    },
    [resetDraft, resetEditing]
  );

  useEffect(() => {
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [handleOutsideClick]);

  if (runningTask) {
    const runningActions = plannedTasks.find((t) => t.id === activePlannedTaskId)?.actions ?? [];
    return (
      <OmniboxRunning
        {...edit}
        runningTask={runningTask}
        projects={projects}
        categories={categories}
        seconds={seconds}
        cancelTask={cancelTask}
        containerRef={containerRef}
        actions={runningActions}
      />
    );
  }

  return (
    <OmniboxIdle
      {...draft}
      projects={projects}
      categories={categories}
      containerRef={containerRef}
      onToggleBillable={onTogglePlannedBillable}
      onNavigatePlanning={onNavigatePlanning}
    />
  );
}
