import { useCallback, useMemo, useRef, useState } from "react";
import { buildTaskTextContext } from "@domain/usecases/llm/taskText/buildTaskTextContext";
import { chooseTaskTextCandidate } from "@domain/usecases/llm/taskText/chooseTaskTextCandidate";
import { formatTaskFieldInstruction } from "@domain/usecases/llm/taskText/formatTaskFieldInstruction";
import { interpretTaskText } from "@domain/usecases/llm/taskText/interpretTaskText";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useProjects } from "@presentation/hooks/useProjects";
import { llmConnected } from "@presentation/integrations/daySummaries";
import { describeTaskTextError } from "@presentation/integrations/taskText";
import type { UUID } from "@shared/types";

export type TaskTextStatus = "idle" | "analyzing" | "preview" | "error";

/** O que um envio devolve a quem o fez; `null` quando outro envio o atropelou. */
export interface TaskTextSubmission {
  interpretation: TaskTextInterpretation;
  submittedAt: string;
}

interface TaskTextState {
  status: TaskTextStatus;
  interpretation: TaskTextInterpretation | null;
  /** Já traduzido por `describeTaskTextError`. */
  error: string | null;
  /** O instante do **primeiro** envio do rascunho — vale até o `reset`. */
  submittedAt: string | null;
}

const IDLE: TaskTextState = {
  status: "idle",
  interpretation: null,
  error: null,
  submittedAt: null,
};

/**
 * O texto curto da tarefa → a prévia que o usuário confirma, para qualquer
 * superfície que inicie ou lance tarefa (omnibox, popup, Lançamento Manual).
 *
 * O catálogo é o do **workspace ativo**, e o casamento com ele é local: ao
 * provedor só vão o texto e, de cada campo, sigla, rótulo e tipo.
 *
 * **O instante do primeiro envio fica** através de reenvios e de fechar a
 * prévia, e só o `reset` o apaga: a tarefa começou quando o usuário apertou
 * Enter pela primeira vez, não quando a IA respondeu.
 */
export function useTaskTextInterpretation() {
  const { createLlmApi } = useIntegrations();
  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { fields } = useCustomFields();
  const { rows } = useProjectCategoryMap();
  const connected = llmConnected(config);

  const { hints, catalog } = useMemo(
    () => buildTaskTextContext({ projects, categories, associations: rows, customFields: fields }),
    [projects, categories, rows, fields]
  );
  const instruction = useMemo(() => formatTaskFieldInstruction(hints), [hints]);

  const [state, setState] = useState<TaskTextState>(IDLE);
  // Em ref, além do estado, porque o `submit` precisa do valor na hora — o
  // estado só chega no próximo render.
  const submittedAtRef = useRef<string | null>(null);
  // Só o envio mais recente escreve: editar o texto no meio da análise descarta
  // a resposta que ainda vai chegar.
  const runIdRef = useRef(0);

  const submit = useCallback(
    async (text: string): Promise<TaskTextSubmission | null> => {
      const runId = ++runIdRef.current;
      const submittedAt = submittedAtRef.current ?? new Date().toISOString();
      submittedAtRef.current = submittedAt;
      setState({ status: "analyzing", interpretation: null, error: null, submittedAt });
      try {
        const interpretation = await interpretTaskText({
          llm: connected ? createLlmApi() : null,
          text,
          hints,
          catalog,
        });
        if (runId !== runIdRef.current) return null;
        setState({ status: "preview", interpretation, error: null, submittedAt });
        return { interpretation, submittedAt };
      } catch (error) {
        if (runId !== runIdRef.current) return null;
        setState({
          status: "error",
          interpretation: null,
          error: describeTaskTextError(error),
          submittedAt,
        });
        return null;
      }
    },
    [connected, createLlmApi, hints, catalog]
  );

  const updateInterpretation = useCallback(
    (change: (interpretation: TaskTextInterpretation) => TaskTextInterpretation) =>
      setState((s) => (s.interpretation ? { ...s, interpretation: change(s.interpretation) } : s)),
    []
  );

  const choose = useCallback(
    (key: string, candidateId: UUID) =>
      updateInterpretation((i) => chooseTaskTextCandidate(i, key, candidateId, catalog)),
    [updateInterpretation, catalog]
  );

  /** O chip de billable da prévia: escolher à mão conta como dito no texto. */
  const setBillable = useCallback(
    (billable: boolean) =>
      updateInterpretation((i) => ({ ...i, billable, billableExplicit: true })),
    [updateInterpretation]
  );

  /** Fecha a prévia (ou a análise em voo) e guarda o instante do primeiro envio. */
  const dismiss = useCallback(() => {
    runIdRef.current++;
    setState({ ...IDLE, submittedAt: submittedAtRef.current });
  }, []);

  /** Volta ao zero, instante inclusive — depois de iniciar, ou com o texto apagado. */
  const reset = useCallback(() => {
    runIdRef.current++;
    submittedAtRef.current = null;
    setState(IDLE);
  }, []);

  return useMemo(
    () => ({
      ...state,
      hints,
      instruction,
      catalog,
      connected,
      submit,
      choose,
      setBillable,
      dismiss,
      reset,
    }),
    [state, hints, instruction, catalog, connected, submit, choose, setBillable, dismiss, reset]
  );
}

export type UseTaskTextInterpretationResult = ReturnType<typeof useTaskTextInterpretation>;
