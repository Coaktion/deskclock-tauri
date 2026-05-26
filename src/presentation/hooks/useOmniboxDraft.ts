import { useCallback, useRef, useState } from "react";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";
import { useOmniboxSuggestions, type SuggestionItem } from "./useOmniboxSuggestions";

export interface DraftState {
  name: string;
  projectName: string;
  projectId: string | null;
  categoryName: string;
  categoryId: string | null;
  billable: boolean;
  plannedTaskId: string | null;
}

const INITIAL_DRAFT: DraftState = {
  name: "",
  projectName: "",
  projectId: null,
  categoryName: "",
  categoryId: null,
  billable: true,
  plannedTaskId: null,
};

interface UseOmniboxDraftParams {
  plannedTasks: PlannedTask[];
  recentTasks: Task[];
  projects: Project[];
  categories: Category[];
  startTask: RunningTaskContextValue["startTask"];
  onStarted?: () => void;
}

export function useOmniboxDraft({
  plannedTasks,
  recentTasks,
  projects,
  categories,
  startTask,
  onStarted,
}: UseOmniboxDraftParams) {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggIdx, setActiveSuggIdx] = useState(0);
  const [editingChip, setEditingChip] = useState<"project" | "category" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useOmniboxSuggestions(
    plannedTasks,
    recentTasks,
    projects,
    categories,
    draft.name
  );

  async function handleStart() {
    await startTask({
      name: draft.name.trim() || null,
      projectId: draft.projectId,
      categoryId: draft.categoryId,
      billable: draft.billable,
      plannedTaskId: draft.plannedTaskId,
    });
    setDraft(INITIAL_DRAFT);
    setShowSuggestions(false);
    onStarted?.();
  }

  function handleSuggestionSelect(s: SuggestionItem) {
    setDraft({
      name: s.name === "(sem nome)" ? "" : s.name,
      projectName: s.projectName ?? "",
      projectId: s.projectId,
      categoryName: s.categoryName ?? "",
      categoryId: s.categoryId,
      billable: s.billable,
      plannedTaskId: s.plannedTaskId,
    });
    setShowSuggestions(false);
    inputRef.current?.focus();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        handleSuggestionSelect(suggestions[activeSuggIdx] ?? suggestions[0]);
      } else {
        void handleStart();
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  // useState setters are stable — [] is correct here
  const reset = useCallback(() => {
    setShowSuggestions(false);
    setFocused(false);
    setEditingChip(null);
  }, []);

  return {
    draft,
    setDraft,
    focused,
    setFocused,
    showSuggestions,
    setShowSuggestions,
    activeSuggIdx,
    setActiveSuggIdx,
    editingChip,
    setEditingChip,
    inputRef,
    suggestions,
    handleStart,
    handleSuggestionSelect,
    handleInputKeyDown,
    reset,
  };
}
