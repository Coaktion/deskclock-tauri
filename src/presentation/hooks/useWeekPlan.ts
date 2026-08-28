import { useCallback, useState } from "react";

import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ExistingPlannedLine, WeekPlanDay } from "@domain/usecases/llm/buildWeekPlanPrompt";
import { planWeek, type WeekPlanDraft } from "@domain/usecases/llm/PlanWeek";
import { importWeekPlan } from "@domain/usecases/plannedTasks/ImportWeekPlan";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { describeLlmError } from "@presentation/sections/integrations/llm/llmConnection";
import { todayISO } from "@shared/utils/time";
import { generateUUID } from "@shared/utils/uuid";

/**
 * Um rascunho na tela: o do use case, mais o id que a lista e a seleção usam e
 * os **nomes** que os dois autocompletes editam.
 *
 * Os nomes andam junto do id, e não derivados dele, porque o campo aceita texto
 * livre: derivando, a primeira tecla digitada não apareceria — o valor voltaria
 * a ser o nome do id que ainda está gravado.
 */
export type WeekPlanRowDraft = WeekPlanDraft & {
  id: string;
  projectName: string;
  categoryName: string;
};

export interface UseWeekPlanOptions {
  weekDays: WeekPlanDay[];
  existing: ExistingPlannedLine[];
}

/**
 * O plano da semana, do pedido à criação.
 *
 * **Só o usuário dispara**, e é a diferença que separa esta tela do resumo do
 * Histórico: lá a busca dispara sozinha porque `day_summaries` faz a segunda
 * rodada custar zero, e aqui não há cache — um plano é rascunho, não fato. Cada
 * geração é uma requisição paga.
 *
 * **A cota medida é persistida**, como no `useDaySummaries` e pela mesma razão:
 * ela só se conhece fazendo a chamada, e o card de Integrações não tem outra
 * fonte.
 */
export function useWeekPlan({ weekDays, existing }: UseWeekPlanOptions) {
  const { plannedTaskRepo } = useRepositories();
  const { createLlmApi } = useIntegrations();
  const config = useAppConfig();
  const workspaceId = useActiveWorkspaceId();
  const { projects } = useProjects();
  const { categories } = useCategories();

  const [request, setRequest] = useState("");
  /** `null` enquanto o pedido não foi gerado — é o que escolhe o passo na tela. */
  const [drafts, setDrafts] = useState<WeekPlanRowDraft[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (request.trim() === "") return;
    setGenerating(true);
    setError(null);
    try {
      const outcome = await planWeek(
        { llm: createLlmApi() },
        { todayISO: todayISO(), weekDays, projects, categories, existing, request }
      );
      if (outcome.limits) {
        await config.set("llmLastLimits", outcome.limits);
        await config.set("llmLastLimitsAt", new Date().toISOString());
      }
      const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
      const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
      setDrafts(
        outcome.drafts.map((draft) => ({
          ...draft,
          id: generateUUID(),
          projectName: draft.projectId ? (projectNameById.get(draft.projectId) ?? "") : "",
          categoryName: draft.categoryId ? (categoryNameById.get(draft.categoryId) ?? "") : "",
        }))
      );
    } catch (err) {
      // O erro cru do provedor nunca chega ao usuário: o texto deles ora é
      // inglês técnico, ora o nome de um campo interno.
      setError(describeLlmError(err));
    } finally {
      setGenerating(false);
    }
  }, [request, createLlmApi, weekDays, projects, categories, existing, config]);

  const updateDraft = useCallback((id: string, next: WeekPlanRowDraft) => {
    setDrafts((prev) => prev?.map((draft) => (draft.id === id ? next : draft)) ?? prev);
  }, []);

  /** Volta ao pedido mantendo o texto — reescrever tudo para ajustar uma frase é o pior caminho. */
  const backToRequest = useCallback(() => {
    setDrafts(null);
    setError(null);
  }, []);

  const create = useCallback(
    async (chosen: WeekPlanRowDraft[]): Promise<PlannedTask[]> => {
      setCreating(true);
      try {
        return await importWeekPlan(plannedTaskRepo, chosen, new Date().toISOString(), workspaceId);
      } finally {
        setCreating(false);
      }
    },
    [plannedTaskRepo, workspaceId]
  );

  return {
    request,
    setRequest,
    drafts,
    generating,
    creating,
    error,
    generate,
    updateDraft,
    backToRequest,
    create,
    projects,
    categories,
  };
}
