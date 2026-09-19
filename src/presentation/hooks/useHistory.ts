import { useState, useCallback, useEffect, useRef } from "react";
import type { Task } from "@domain/entities/Task";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { getHistoryTotals, type HistoryTotals } from "@domain/usecases/tasks/GetHistoryTotals";
import { setGroupBillable } from "@domain/usecases/tasks/SetGroupBillable";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { notifyTasksChanged } from "@shared/utils/taskSync";
import { listen } from "@tauri-apps/api/event";
import { todayISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { useWeekStart } from "@presentation/hooks/useWeekStart";
import { useTaskUndo } from "@presentation/hooks/useTaskUndo";
import type { WeekStart } from "@shared/types/appConfig";
import { dateRangeFor, type DateRangeId } from "@shared/utils/datePresets";
import type { UUID } from "@shared/types";

export type QuickFilter = "today" | "lastDay" | "7days" | "30days" | "month" | "custom";

export interface HistoryFilters {
  quick: QuickFilter;
  startDate: string;
  endDate: string;
  name: string;
  projectId: UUID | null;
  categoryId: UUID | null;
  billable: "all" | "yes" | "no";
}

export interface DayGroup {
  dateISO: string;
  tasks: Task[];
  totalSeconds: number;
}

type DayRange = { start: string; end: string };

/**
 * O intervalo de um filtro rápido — `null` quando ele não tem dia nenhum a
 * mostrar, que é o caso de "Dia anterior" num banco sem registro passado.
 *
 * **"Dia anterior" não é "ontem".** Ele resolve para o último dia com tarefa
 * concluída **antes de hoje**, e é isso que o faz atravessar fim de semana,
 * feriado e férias: na segunda de manhã ele continua sendo a sexta, e continua
 * sendo a sexta mesmo depois de hoje ganhar registros.
 */
async function resolveRange(
  repo: ITaskRepository,
  filters: HistoryFilters,
  workspaceId: string,
  weekStartsOn: WeekStart
): Promise<DayRange | null> {
  if (filters.quick !== "lastDay") {
    return quickToRange(filters.quick, filters.startDate, filters.endDate, weekStartsOn);
  }
  const day = await repo.findLastDayWithCompletedTasks(workspaceId, { before: todayISO() });
  return day ? { start: day, end: day } : null;
}

/**
 * O vocabulário desta tela traduzido para a tabela única (`datePresets`).
 *
 * Os nomes ficam onde estão: são o que o `QUICK_LABELS` do `HistoryPage` desenha
 * nas pílulas, e renomeá-los mexeria em tela para não mudar comportamento
 * nenhum. O que saiu daqui foi a aritmética, que estava escrita igual em outros
 * dois lugares.
 *
 * `lastDay` fica de fora, e não por esquecimento: o dia dele depende do banco, e
 * uma tabela de datas puras não o alcança. Quem o resolve é `resolveRange`.
 */
const QUICK_RANGE: Record<Exclude<QuickFilter, "custom" | "lastDay">, DateRangeId> = {
  today: "today",
  "7days": "last7",
  "30days": "last30",
  month: "thisMonth",
};

function quickToRange(
  quick: Exclude<QuickFilter, "lastDay">,
  startDate: string,
  endDate: string,
  weekStartsOn: WeekStart
): DayRange {
  if (quick === "custom") return { start: startDate, end: endDate };
  return dateRangeFor(QUICK_RANGE[quick], weekStartsOn);
}

function localDateISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function groupByDay(tasks: Task[]): DayGroup[] {
  const map = new Map<string, Task[]>();
  for (const t of tasks) {
    const dateISO = localDateISO(t.startTime);
    if (!map.has(dateISO)) map.set(dateISO, []);
    map.get(dateISO)!.push(t);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a)) // mais recente primeiro
    .map(([dateISO, dayTasks]) => ({
      dateISO,
      tasks: dayTasks.sort((a, b) => b.startTime.localeCompare(a.startTime)),
      totalSeconds: dayTasks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0),
    }));
}

const INITIAL_FILTERS: HistoryFilters = {
  quick: "today",
  startDate: todayISO(),
  endDate: todayISO(),
  name: "",
  projectId: null,
  categoryId: null,
  billable: "all",
};

export function useHistory() {
  const { taskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const weekStartsOn = useWeekStart();
  const [filters, setFilters] = useState<HistoryFilters>(INITIAL_FILTERS);
  const [groups, setGroups] = useState<DayGroup[]>([]);
  const [totals, setTotals] = useState<HistoryTotals>({
    totalSeconds: 0,
    billableSeconds: 0,
    nonBillableSeconds: 0,
    count: 0,
  });
  const [searched, setSearched] = useState(false);
  // O filtro da busca que **rodou**, não o que está na tela: o painel avançado
  // muda `filters.quick` sem buscar, e a mensagem de vazio descreve o resultado
  // que está à vista.
  const [searchedQuick, setSearchedQuick] = useState<QuickFilter>(INITIAL_FILTERS.quick);
  // Pelo mesmo motivo, recarregar repete a busca que rodou: com `filters`, excluir
  // uma linha com o campo Nome editado e não buscado trocaria a lista inteira.
  const lastSearchedRef = useRef<HistoryFilters>(INITIAL_FILTERS);

  const search = useCallback(
    async (f: HistoryFilters) => {
      lastSearchedRef.current = f;
      const range = await resolveRange(taskRepo, f, workspaceId, weekStartsOn);
      setSearchedQuick(f.quick);
      if (!range) {
        setGroups([]);
        setTotals({ totalSeconds: 0, billableSeconds: 0, nonBillableSeconds: 0, count: 0 });
        setSearched(true);
        return;
      }
      const tasks = await searchTasks(taskRepo, {
        startISO: startOfDayISO(range.start),
        endISO: endOfDayISO(range.end),
        name: f.name || undefined,
        projectId: f.projectId ?? undefined,
        categoryId: f.categoryId ?? undefined,
        billable: f.billable === "all" ? undefined : f.billable === "yes",
        workspaceId,
      });
      setGroups(groupByDay(tasks));
      setTotals(getHistoryTotals(tasks));
      setSearched(true);
    },
    [taskRepo, workspaceId, weekStartsOn]
  );

  const updateFilter = useCallback(
    <K extends keyof HistoryFilters>(key: K, value: HistoryFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const setQuick = useCallback((quick: QuickFilter) => {
    setFilters((prev) => ({ ...prev, quick }));
  }, []);

  const reload = useCallback(() => search(lastSearchedRef.current), [search]);

  // Excluir e desfazer recarregam a busca, sem remendo local: o desfazer
  // devolve a tarefa, e o remendo teria de saber repô-la no dia e nos totais.
  const { removeWithUndo } = useTaskUndo(reload);

  /**
   * Alterna o faturamento da entrada e das irmãs do grupo dela — a mesma regra
   * da tela de Tarefas, e o recorte que `setGroupBillable` prevê para o dia
   * aberto no histórico.
   *
   * Recarrega em vez de remendar o estado local, como faz a exclusão: a
   * alternância mexe em N tarefas e move segundos entre os dois totais, e um
   * remendo que erre a conta fica na tela dizendo um total que o banco não tem.
   */
  const toggleBillable = useCallback(
    async (task: Task) => {
      await setGroupBillable(taskRepo, task, !task.billable, new Date().toISOString());
      void notifyTasksChanged();
      await reload();
    },
    [taskRepo, reload]
  );

  // Trocar de workspace não emite TASKS_CHANGED — nenhuma tarefa mudou, mudou o
  // recorte. Sem isto os resultados na tela continuam sendo os do workspace
  // anterior, já que a busca só roda quando o usuário a dispara.
  //
  // O ref é o que permite declarar todas as dependências: `reload` muda com o
  // workspace e com a semana, e o efeito só deve buscar na troca de workspace.
  const lastWorkspaceId = useRef(workspaceId);
  useEffect(() => {
    if (lastWorkspaceId.current === workspaceId) return;
    lastWorkspaceId.current = workspaceId;
    if (searched) void reload();
  }, [workspaceId, searched, reload]);

  // Recarrega a busca atual quando tarefas mudam em qualquer janela
  useEffect(() => {
    const unlisten = listen(OVERLAY_EVENTS.TASKS_CHANGED, () => {
      if (searched) void reload();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [searched, reload]);

  return {
    filters,
    groups,
    totals,
    searched,
    searchedQuick,
    search,
    updateFilter,
    setQuick,
    removeWithUndo,
    toggleBillable,
    reload,
  };
}
