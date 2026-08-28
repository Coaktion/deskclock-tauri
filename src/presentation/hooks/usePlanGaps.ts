import { useCallback, useMemo, useState } from "react";

import type { PlannedTask } from "@domain/entities/PlannedTask";
import { fillPlanGaps, tasksWithGaps, type PlanGapFill } from "@domain/usecases/llm/FillPlanGaps";
import { applyPlanGapFills } from "@domain/usecases/plannedTasks/ApplyPlanGapFills";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjects } from "@presentation/hooks/useProjects";
import { describeLlmError } from "@presentation/sections/integrations/llm/llmConnection";

/**
 * O preenchimento das lacunas das planejadas da semana.
 *
 * Irmão do `useWeekPlan`, e com a mesma disciplina: **só o usuário dispara**,
 * não há cache, e a cota medida é persistida porque ela só se conhece fazendo a
 * chamada.
 *
 * O que o separa do irmão é o que está em jogo: lá o modelo propõe linhas
 * **novas**, aqui ele completa as que já existem. Por isso a trava de nunca
 * sobrescrever mora no use case, e não só no prompt.
 */
export function usePlanGaps(tasks: PlannedTask[]) {
  const { plannedTaskRepo } = useRepositories();
  const { createLlmApi } = useIntegrations();
  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { activeFields } = useCustomFields();

  // Só campos de escolha: nos livres o modelo escreveria conteúdo inventado no
  // campo de alguém, sem lista contra a qual conferir a resposta (§ use case).
  const selectFields = useMemo(
    () => activeFields.filter((field) => field.type === "select"),
    [activeFields]
  );
  const gaps = useMemo(() => tasksWithGaps(tasks, selectFields), [tasks, selectFields]);

  const [fills, setFills] = useState<PlanGapFill[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const outcome = await fillPlanGaps(
        { llm: createLlmApi() },
        { tasks, projects, categories, selectFields }
      );
      if (outcome.limits) {
        await config.set("llmLastLimits", outcome.limits);
        await config.set("llmLastLimitsAt", new Date().toISOString());
      }
      setFills(outcome.fills);
    } catch (err) {
      setError(describeLlmError(err));
    } finally {
      setGenerating(false);
    }
  }, [createLlmApi, tasks, projects, categories, selectFields, config]);

  const apply = useCallback(
    async (chosen: PlanGapFill[]) => applyPlanGapFills(plannedTaskRepo, chosen),
    [plannedTaskRepo]
  );

  return {
    gaps,
    fills,
    generating,
    applying,
    setApplying,
    error,
    generate,
    apply,
    projects,
    categories,
    selectFields,
  };
}
