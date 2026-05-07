import { useCallback, useEffect, useRef } from "react";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";
import { useOmniboxRunningEdit } from "@presentation/hooks/useOmniboxRunningEdit";
import { OmniboxIdle } from "./OmniboxIdle";
import { OmniboxRunning } from "./OmniboxRunning";

interface OmniboxProps {
  plannedTasks: PlannedTask[];
  recentTasks: Task[];
  projects: Project[];
  categories: Category[];
  onStarted?: () => void;
  focusTaskEdit?: boolean;
  onFocusTaskEditHandled?: () => void;
}

export function Omnibox({
  plannedTasks,
  recentTasks,
  projects,
  categories,
  onStarted,
  focusTaskEdit,
  onFocusTaskEditHandled,
}: OmniboxProps) {
  const { runningTask, startTask, pauseTask, resumeTask, stopTask, cancelTask, updateActiveTask } =
    useRunningTask();
  const seconds = useTaskTimer(runningTask);
  const containerRef = useRef<HTMLDivElement>(null);

  const draft = useOmniboxDraft({
    plannedTasks,
    recentTasks,
    projects,
    categories,
    startTask,
    onStarted,
  });

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
    return (
      <OmniboxRunning
        {...edit}
        runningTask={runningTask}
        projects={projects}
        categories={categories}
        seconds={seconds}
        cancelTask={cancelTask}
        containerRef={containerRef}
      />
    );
  }

  return (
    <OmniboxIdle
      {...draft}
      projects={projects}
      categories={categories}
      containerRef={containerRef}
    />
  );
}
