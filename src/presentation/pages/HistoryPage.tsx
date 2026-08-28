import type { Task } from "@domain/entities/Task";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import {
  Button,
  FilterPill,
  PageHeader,
  SearchInput,
  SegmentedControl,
  Select,
} from "@presentation/components/ui";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useHistory, type QuickFilter } from "@presentation/hooks/useHistory";
import { useProjects } from "@presentation/hooks/useProjects";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { ExportModal } from "@presentation/modals/ExportModal";
import { MoveToWorkspaceModal } from "@presentation/modals/MoveToWorkspaceModal";
import { HistoryKpisTab } from "@presentation/sections/history/HistoryKpisTab";
import { HistoryTasksTab } from "@presentation/sections/history/HistoryTasksTab";
import { FileDown, Filter, Search } from "lucide-react";
import { useEffect, useState } from "react";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

type ResultTab = "tarefas" | "kpis";

/**
 * Duas opções, sempre à vista, uma sempre escolhida: é o contrato do
 * `SegmentedControl`, e não o da pílula — que expressa o "nenhum filtro
 * aplicado" que aqui não existe. É também o que separa, à vista, a troca de
 * recorte do resultado das pílulas de período logo acima.
 */
const RESULT_TABS = [
  { value: "tarefas", label: "Tarefas" },
  { value: "kpis", label: "KPIs" },
] as const satisfies readonly { value: ResultTab; label: string }[];

export function HistoryPage() {
  const {
    filters,
    groups,
    totals,
    searched,
    search,
    updateFilter,
    setQuick,
    remove,
    toggleBillable,
    reload,
  } = useHistory();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [movingTasks, setMovingTasks] = useState<Task[] | null>(null);
  // A aba é estado da página, não do resultado: trocar de aba não refaz a busca
  // nem desmonta a seleção em lote, que também mora aqui.
  const [tab, setTab] = useState<ResultTab>("tarefas");
  const { workspaces } = useWorkspaces();

  useEffect(() => {
    void search(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    void search(filters);
  }

  // O mesmo submit para os dois blocos de filtro: o painel avançado e a busca
  // por nome — em ambos o Enter significa "buscar".
  const handleKeyDown = useSubmitOnEnter(handleSearch);

  function handleQuick(quick: QuickFilter) {
    setQuick(quick);
    if (quick === "custom") setAdvancedOpen(true);
    else setAdvancedOpen(false);
    void search({ ...filters, quick });
  }

  const allTasks = groups.flatMap((g) => g.tasks);

  function toggleSelectTask(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function handleBulkDelete() {
    for (const id of selectedIds) {
      await remove(id);
    }
    exitSelectMode();
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <PageHeader
        title="Histórico"
        actions={
          <>
            {/* Aberto vira `accent`: com um `secondary` só, ligado e desligado
                ficariam indistinguíveis — era a borda sem fundo que dizia
                "desligado", e ela saiu com a unificação da variante. */}
            <Button
              variant={advancedOpen ? "accent" : "secondary"}
              expanded={advancedOpen}
              onClick={() => setAdvancedOpen((o) => !o)}
              icon={<Filter size={14} />}
            >
              Filtros
            </Button>
            <Button
              variant="secondary"
              onClick={() => setExportOpen(true)}
              icon={<FileDown size={14} />}
            >
              Exportar
            </Button>
          </>
        }
      />

      {/* Rolador único da tela: os dois blocos de filtro rolam junto com o
          resultado, e só o cabeçalho fica fixo. Quem gruda no topo ao rolar é a
          barra de abas. */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Recorte do período: fica fora do cabeçalho porque as cinco pílulas e
            os dois botões, juntos, não cabem nos 56 px sem quebrar em duas
            linhas. A busca divide a linha com as pílulas, como o spec desenha
            (`1/1/1/0`): ela é o sexto filho, em `flex-1`, e o `ml-1` é o degrau
            a mais que o design abre entre a última pílula e o campo. */}
        <div
          onKeyDown={handleKeyDown}
          className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border-subtle flex-wrap"
        >
          {(["today", "7days", "30days", "month", "custom"] as QuickFilter[]).map((q) => (
            <FilterPill key={q} active={filters.quick === q} onClick={() => handleQuick(q)}>
              {QUICK_LABELS[q]}
            </FilterPill>
          ))}
          <SearchInput
            value={filters.name}
            onChange={(v) => updateFilter("name", v)}
            placeholder="Buscar por nome…"
            ariaLabel="Buscar por nome"
            className="flex-1 ml-1"
          />
        </div>

        {advancedOpen && (
          <div
            onKeyDown={handleKeyDown}
            className="flex flex-col gap-2 px-4 py-3 border-b border-border-subtle"
          >
            <div className="flex gap-2">
              <DatePickerInput
                value={filters.startDate}
                onChange={(v) => {
                  updateFilter("startDate", v);
                  updateFilter("quick", "custom");
                }}
                placeholder="Início"
                className="flex-1"
              />
              <span className="self-center text-fg-muted text-sm">→</span>
              <DatePickerInput
                value={filters.endDate}
                onChange={(v) => {
                  updateFilter("endDate", v);
                  updateFilter("quick", "custom");
                }}
                placeholder="Fim"
                className="flex-1"
              />
            </div>
            <div className="flex gap-2">
              <Autocomplete
                value={projectName}
                onChange={(v) => {
                  setProjectName(v);
                  if (!v) updateFilter("projectId", null);
                }}
                onSelect={(o) => {
                  setProjectName(o.name);
                  updateFilter("projectId", o.id);
                }}
                options={projects}
                placeholder="Projeto"
                className="flex-1"
              />
              <Autocomplete
                value={categoryName}
                onChange={(v) => {
                  setCategoryName(v);
                  if (!v) updateFilter("categoryId", null);
                }}
                onSelect={(o) => {
                  setCategoryName(o.name);
                  updateFilter("categoryId", o.id);
                }}
                options={categories}
                placeholder="Categoria"
                className="flex-1"
              />
              <Select
                aria-label="Billable"
                size="sm"
                value={filters.billable}
                onChange={(e) => updateFilter("billable", e.target.value as "all" | "yes" | "no")}
              >
                <option value="all">Billable: Todos</option>
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </Select>
            </div>
            <Button variant="accent" onClick={handleSearch} icon={<Search size={14} />}>
              Buscar
            </Button>
          </div>
        )}

        {/* Aqui entra o resumo do período — etapa própria. */}

        {!searched ? (
          <p className="text-center text-fg-muted text-sm py-12">
            Use os filtros acima para buscar registros
          </p>
        ) : (
          <>
            {/* Grudada no topo, a barra passa por cima do que rola atrás: o
                fundo é o do canvas da página, ou o texto se sobreporia. O `z-10`
                a põe acima das linhas e abaixo das listas do `Autocomplete`
                (z-50), que abrem dos filtros logo acima. */}
            <div className="sticky top-0 z-10 bg-canvas px-5 py-2.5 border-b border-border-subtle">
              <SegmentedControl
                value={tab}
                onChange={setTab}
                options={RESULT_TABS}
                ariaLabel="Recorte do resultado"
                className="w-max"
              />
            </div>

            <div className="p-5 flex flex-col gap-3">
              {tab === "tarefas" ? (
                <HistoryTasksTab
                  groups={groups}
                  allTasks={allTasks}
                  projects={projects}
                  categories={categories}
                  selectMode={selectMode}
                  selectedIds={selectedIds}
                  canMoveToWorkspace={workspaces.length > 1}
                  onEnterSelectMode={() => setSelectMode(true)}
                  onExitSelectMode={exitSelectMode}
                  onToggleSelectTask={toggleSelectTask}
                  onChangeSelection={(updater) => setSelectedIds(updater)}
                  onMoveSelected={() =>
                    setMovingTasks(allTasks.filter((t) => selectedIds.has(t.id)))
                  }
                  onBulkDelete={() => void handleBulkDelete()}
                  onEditTask={setEditingTask}
                  onRemoveTask={(id) => void remove(id)}
                  onToggleBillable={(task) => void toggleBillable(task)}
                />
              ) : (
                <HistoryKpisTab
                  groups={groups}
                  tasks={allTasks}
                  projects={projects}
                  totals={totals}
                />
              )}
            </div>
          </>
        )}
      </div>

      {exportOpen && (
        <ExportModal
          projects={projects}
          categories={categories}
          onClose={() => setExportOpen(false)}
        />
      )}

      {movingTasks && (
        <MoveToWorkspaceModal
          tasks={movingTasks}
          projects={projects}
          categories={categories}
          onMoved={() => {
            exitSelectMode();
            void reload();
          }}
          onClose={() => setMovingTasks(null)}
        />
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={reload}
          onClose={() => setEditingTask(null)}
        />
      )}
    </div>
  );
}
