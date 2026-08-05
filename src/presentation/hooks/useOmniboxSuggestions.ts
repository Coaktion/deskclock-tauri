import { useMemo } from "react";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";

export interface SuggestionItem {
  key: string;
  name: string;
  projectName?: string;
  billable: boolean;
  projectId: string | null;
  categoryId: string | null;
  categoryName?: string;
  isPlanned: boolean;
  plannedTaskId: string | null;
  /** Viaja junto porque entra na chave de agrupamento (§6.3): iniciar a partir
   *  de uma sugestão sem ele criaria um grupo diferente do da tarefa de origem. */
  customValues: CustomValues;
}

export function useOmniboxSuggestions(
  plannedTasks: PlannedTask[],
  recentTasks: Task[],
  projects: Project[],
  categories: Category[],
  query: string
): SuggestionItem[] {
  return useMemo(() => {
    const q = query.toLowerCase().trim();

    const planned: SuggestionItem[] = plannedTasks.map((t) => ({
      key: `planned-${t.id}`,
      name: t.name,
      projectName: projects.find((p) => p.id === t.projectId)?.name,
      billable: t.billable,
      projectId: t.projectId,
      categoryId: t.categoryId,
      categoryName: categories.find((c) => c.id === t.categoryId)?.name,
      isPlanned: true,
      plannedTaskId: t.id,
      customValues: t.customValues,
    }));

    const seen = new Set<string>();
    const recent: SuggestionItem[] = [];
    for (const t of recentTasks) {
      const key = `${t.name ?? ""}|${t.projectId ?? ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        recent.push({
          key: `recent-${t.id}`,
          name: t.name ?? "(sem nome)",
          projectName: projects.find((p) => p.id === t.projectId)?.name,
          billable: t.billable,
          projectId: t.projectId,
          categoryId: t.categoryId,
          categoryName: categories.find((c) => c.id === t.categoryId)?.name,
          isPlanned: false,
          // Reexecutar carrega a origem da tarefa copiada: sem ela, parar a nova
          // execução não teria qual planejada marcar como concluída, e ela
          // continuaria pendente no planejamento (§4.1). `isPlanned` segue false —
          // a sugestão veio do histórico do dia, não da lista de planejadas.
          plannedTaskId: t.plannedTaskId ?? null,
          customValues: t.customValues,
        });
      }
    }

    const all = [...planned, ...recent];
    if (!q) return all.slice(0, 8);
    return all
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) || (s.projectName?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 8);
  }, [plannedTasks, recentTasks, projects, categories, query]);
}
