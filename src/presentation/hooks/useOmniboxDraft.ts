import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { matchPlannedTasks } from "@domain/utils/plannedPending";
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
  plannedTasks: PlannedTask[];
  /** O dia de que as planejadas são recortadas — é ele que decide o que é pendente. */
  today: string;
  startTask: RunningTaskContextValue["startTask"];
  onStarted?: () => void;
}

export function useOmniboxDraft({
  plannedTasks,
  today,
  startTask,
  onStarted,
}: UseOmniboxDraftParams) {
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggIdx, setActiveSuggIdx] = useState(0);
  const [editingChip, setEditingChip] = useState<"project" | "category" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => matchPlannedTasks(plannedTasks, today, draft.name),
    [plannedTasks, today, draft.name]
  );

  // A lista se reordena a cada tecla; o índice antigo apontaria para outra tarefa.
  useEffect(() => setActiveSuggIdx(0), [draft.name]);

  async function handleStart() {
    await startTask({
      name: draft.name.trim() || null,
      projectId: draft.projectId,
      categoryId: draft.categoryId,
      billable: draft.billable,
      // O rascunho cria tarefa avulsa: quem carrega o vínculo e os campos
      // personalizados é a planejada escolhida na lista, por `startPlanned`.
      plannedTaskId: null,
      customValues: {},
    });
    setDraft(INITIAL_DRAFT);
    setShowSuggestions(false);
    onStarted?.();
  }

  /**
   * Escolher uma planejada **inicia** — não preenche o rascunho. É o que mantém
   * o `DraftState` sem `plannedTaskId` nem `customValues`: os dois viajam daqui
   * direto para o `startTask`, e o vínculo (§4.1) é o que faz parar a tarefa
   * marcar a planejada como concluída.
   */
  async function startPlanned(task: PlannedTask) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
      plannedTaskId: task.id,
      customValues: task.customValues,
    });
    setDraft(INITIAL_DRAFT);
    setShowSuggestions(false);
    onStarted?.();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const listOpen = showSuggestions && suggestions.length > 0;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (listOpen) {
        void startPlanned(suggestions[activeSuggIdx] ?? suggestions[0]);
      } else {
        void handleStart();
      }
    } else if (e.key === "Escape" && listOpen) {
      // Sinaliza que o ESC foi consumido: sem isto ele desceria para quem
      // escuta a tecla acima do campo.
      e.stopPropagation();
      e.preventDefault();
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
    startPlanned,
    handleInputKeyDown,
    reset,
  };
}
