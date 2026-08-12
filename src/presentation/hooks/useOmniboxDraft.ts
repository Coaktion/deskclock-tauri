import { useCallback, useRef, useState } from "react";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";

export interface DraftState {
  name: string;
  projectName: string;
  projectId: string | null;
  categoryName: string;
  categoryId: string | null;
  billable: boolean;
}

const INITIAL_DRAFT: DraftState = {
  name: "",
  projectName: "",
  projectId: null,
  categoryName: "",
  categoryId: null,
  billable: true,
};

interface UseOmniboxDraftParams {
  startTask: RunningTaskContextValue["startTask"];
  onStarted?: () => void;
}

export function useOmniboxDraft({ startTask, onStarted }: UseOmniboxDraftParams) {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [focused, setFocused] = useState(false);
  const [editingChip, setEditingChip] = useState<"project" | "category" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleStart() {
    await startTask({
      name: draft.name.trim() || null,
      projectId: draft.projectId,
      categoryId: draft.categoryId,
      billable: draft.billable,
      // O omnibox cria tarefa avulsa: quem inicia uma planejada é a lista de
      // planejadas, que leva o vínculo e os campos personalizados dela.
      plannedTaskId: null,
      customValues: {},
    });
    setDraft(INITIAL_DRAFT);
    onStarted?.();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleStart();
    }
  }

  // useState setters are stable — [] is correct here
  const reset = useCallback(() => {
    setFocused(false);
    setEditingChip(null);
  }, []);

  return {
    draft,
    setDraft,
    focused,
    setFocused,
    editingChip,
    setEditingChip,
    inputRef,
    handleStart,
    handleInputKeyDown,
    reset,
  };
}
