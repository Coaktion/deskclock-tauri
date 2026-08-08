import { useState, useEffect } from "react";
import { Search, Pencil, Trash2, FileDown, Filter } from "lucide-react";
import { useHistory, type QuickFilter, type DayGroup } from "@presentation/hooks/useHistory";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { FilterPill, KpiCard, PageHeader, SearchInput, TaskRow } from "@presentation/components/ui";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { ExportModal } from "@presentation/modals/ExportModal";
import { MoveToWorkspaceModal } from "@presentation/modals/MoveToWorkspaceModal";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { formatHHMMSS, formatHHMM, formatHistoryDayHeader } from "@shared/utils/time";
import { getProjectColor } from "@shared/utils/projectColor";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

const cardClass = "bg-surface border border-border-subtle rounded-card";
const eyebrowClass = "text-overline uppercase text-fg-muted";

function Timeline({ tasks, projects }: { tasks: Task[]; projects: Project[] }) {
  const parseMinutes = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  const dayStart = 6 * 60;
  const dayEnd = 22 * 60;
  const dayRange = dayEnd - dayStart;

  const totalSeconds = tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);

  return (
    <div className={`${cardClass} p-3`}>
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className={eyebrowClass}>Linha do tempo</div>
          <div className="font-mono tabular-nums text-base text-fg mt-0.5">
            {formatHHMMSS(totalSeconds)}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {projects
            .filter((p) => tasks.some((t) => t.projectId === p.id))
            .map((p) => (
              <span key={p.id} className="flex items-center gap-1 text-xs text-fg-secondary">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: getProjectColor(p.id) }}
                />
                {p.name}
              </span>
            ))}
        </div>
      </div>
      {/* A pista é `raised` e não `canvas` porque tem de destacar do cartão nos
          dois modos: no claro a superfície é branca e o canvas quase branco. */}
      <div className="relative h-11 bg-raised rounded-control overflow-hidden">
        {tasks.map((task) => {
          if (!task.endTime) return null;
          const start = parseMinutes(task.startTime);
          const end = parseMinutes(task.endTime);
          const left = Math.max(0, ((start - dayStart) / dayRange) * 100);
          const width = Math.max(0.5, ((end - start) / dayRange) * 100);
          const color = getProjectColor(task.projectId);
          const startStr = new Date(task.startTime).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          const endStr = new Date(task.endTime).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return (
            <div
              key={task.id}
              className="absolute top-1 bottom-1 rounded-sm"
              style={{ left: `${left}%`, width: `${width}%`, backgroundColor: color }}
              title={`${task.name ?? "(sem nome)"} · ${startStr}–${endStr}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        {[6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
          <span key={h} className="text-xs font-mono tabular-nums text-fg-muted">
            {String(h).padStart(2, "0")}h
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectDistribution({ groups, projects }: { groups: DayGroup[]; projects: Project[] }) {
  const totals: Record<string, { id: string | null; name: string; seconds: number }> = {};
  groups.forEach((g) =>
    g.tasks.forEach((t) => {
      const key = t.projectId ?? "__none__";
      const name = t.projectId
        ? (projects.find((p) => p.id === t.projectId)?.name ?? "—")
        : "Sem projeto";
      if (!totals[key]) totals[key] = { id: t.projectId ?? null, name, seconds: 0 };
      totals[key].seconds += t.durationSeconds ?? 0;
    })
  );
  const list = Object.values(totals).sort((a, b) => b.seconds - a.seconds);
  if (list.length === 0) return null;
  const max = Math.max(...list.map((x) => x.seconds));

  return (
    <div className={`${cardClass} p-3`}>
      <div className={`${eyebrowClass} mb-2`}>Por projeto</div>
      <div className="flex flex-col gap-2">
        {list.map((x) => {
          const h = Math.floor(x.seconds / 3600);
          const m = Math.floor((x.seconds % 3600) / 60);
          const color = getProjectColor(x.id);
          return (
            // A `key` é a mesma chave do agrupamento, não o nome: projeto que
            // não está no catálogo vira "—", e dois ids órfãos diferentes
            // rendiam duas linhas com o mesmo nome.
            <div key={x.id ?? "__none__"} className="flex items-center gap-2">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-fg truncate pr-2">{x.name}</span>
                  <span className="font-mono tabular-nums text-fg-secondary shrink-0">
                    {h}h{String(m).padStart(2, "0")}
                  </span>
                </div>
                <div className="h-1 bg-raised rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${(x.seconds / max) * 100}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HistoryPage() {
  const { filters, groups, totals, searched, search, updateFilter, setQuick, remove, reload } =
    useHistory();
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
  const allSelected = allTasks.length > 0 && selectedIds.size >= allTasks.length;

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
            <button
              onClick={() => setAdvancedOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-control transition-colors ${
                advancedOpen
                  ? "bg-raised border-border text-fg"
                  : "bg-transparent border-border text-fg-muted hover:text-fg hover:border-fg-muted"
              }`}
            >
              <Filter size={14} />
              Filtros
            </button>
            <button
              onClick={() => setExportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-border text-fg-muted hover:text-fg hover:border-fg-muted rounded-control transition-colors"
            >
              <FileDown size={14} />
              Exportar
            </button>
          </>
        }
      />

      {/* Recorte do período: fica fora do cabeçalho porque as cinco pílulas e os
          dois botões, juntos, não cabem nos 56 px sem quebrar em duas linhas. */}
      <div className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 border-b border-border-subtle flex-wrap">
        {(["today", "7days", "30days", "month", "custom"] as QuickFilter[]).map((q) => (
          <FilterPill key={q} active={filters.quick === q} onClick={() => handleQuick(q)}>
            {QUICK_LABELS[q]}
          </FilterPill>
        ))}
      </div>

      {advancedOpen && (
        <div
          onKeyDown={handleKeyDown}
          className="shrink-0 flex flex-col gap-2 px-4 py-3 border-b border-border-subtle"
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
            <select
              value={filters.billable}
              onChange={(e) => updateFilter("billable", e.target.value as "all" | "yes" | "no")}
              className="px-2.5 py-1.5 text-xs bg-raised border border-border rounded-control text-fg focus:outline-none focus:border-accent transition-colors cursor-pointer"
            >
              <option value="all">Billable: Todos</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </div>
          <button
            onClick={handleSearch}
            className="flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-accent-text bg-accent/10 border border-accent/30 hover:bg-accent/20 hover:border-accent/50 rounded-control transition-colors"
          >
            <Search size={14} />
            Buscar
          </button>
        </div>
      )}

      <div onKeyDown={handleKeyDown} className="shrink-0 px-4 py-2.5 border-b border-border-subtle">
        <SearchInput
          value={filters.name}
          onChange={(v) => updateFilter("name", v)}
          placeholder="Buscar por nome…"
          ariaLabel="Buscar por nome"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-3">
        {searched && allTasks.length > 0 && (
          <div className="grid grid-cols-[1.5fr_1fr] gap-3">
            <Timeline tasks={allTasks} projects={projects} />
            <ProjectDistribution groups={groups} projects={projects} />
          </div>
        )}

        {searched && (
          <div className="flex gap-2">
            <KpiCard label="Total" value={formatHHMMSS(totals.totalSeconds)} />
            <KpiCard
              label="Billable"
              value={formatHHMMSS(totals.billableSeconds)}
              tone="billable"
            />
            <KpiCard
              label="Non-billable"
              value={formatHHMMSS(totals.nonBillableSeconds)}
              tone="muted"
            />
            <KpiCard label="Registros" value={String(totals.count)} tone="muted" />
          </div>
        )}

        {searched && groups.length === 0 && (
          <p className="text-center text-fg-muted text-sm py-12">Nenhum registro encontrado</p>
        )}
        {!searched && (
          <p className="text-center text-fg-muted text-sm py-12">
            Use os filtros acima para buscar registros
          </p>
        )}

        {searched && groups.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-widest text-fg-secondary">
                Entradas
              </span>
              {selectMode ? (
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setSelectedIds(allSelected ? new Set() : new Set(allTasks.map((t) => t.id)))
                    }
                    className="text-xs text-fg-muted hover:text-fg transition-colors"
                  >
                    {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </button>
                  {workspaces.length > 1 && (
                    <button
                      onClick={() => setMovingTasks(allTasks.filter((t) => selectedIds.has(t.id)))}
                      disabled={selectedIds.size === 0}
                      className="text-xs text-fg-muted hover:text-fg disabled:text-fg-muted/50 disabled:cursor-not-allowed transition-colors"
                    >
                      Mover para workspace
                    </button>
                  )}
                  <button
                    onClick={() => void handleBulkDelete()}
                    disabled={selectedIds.size === 0}
                    className="text-xs text-danger hover:opacity-80 disabled:text-fg-muted/50 disabled:opacity-100 disabled:cursor-not-allowed transition-colors"
                  >
                    Excluir{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </button>
                  <button
                    onClick={exitSelectMode}
                    className="text-xs text-fg-muted hover:text-fg transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setSelectMode(true)}
                  className="text-xs px-2.5 py-1 border border-border text-fg-muted hover:text-fg hover:border-fg-muted rounded-control transition-colors"
                >
                  Selecionar tarefas
                </button>
              )}
            </div>

            {groups.map((group) => (
              <div key={group.dateISO} className={cardClass}>
                {/* Sem `overflow-hidden` no cartão: ele viraria o scrollport do
                    `sticky` abaixo, que então nunca sairia do lugar. */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-surface border-b border-border-subtle rounded-t-card">
                  <span className="text-xs font-semibold uppercase tracking-widest text-fg-secondary">
                    {formatHistoryDayHeader(group.dateISO)}
                  </span>
                  <div className="flex items-center gap-2">
                    {selectMode && group.tasks.length > 0 && (
                      <button
                        onClick={() => {
                          const groupIds = group.tasks.map((t) => t.id);
                          const groupSelected = groupIds.every((id) => selectedIds.has(id));
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (groupSelected) groupIds.forEach((id) => next.delete(id));
                            else groupIds.forEach((id) => next.add(id));
                            return next;
                          });
                        }}
                        className="text-xs text-fg-muted hover:text-fg transition-colors"
                      >
                        {group.tasks.every((t) => selectedIds.has(t.id))
                          ? "Desmarcar"
                          : "Selecionar"}
                      </button>
                    )}
                    <span className="text-xs font-mono tabular-nums text-fg-muted">
                      {formatHHMM(group.totalSeconds)}
                    </span>
                  </div>
                </div>

                <div className="p-1.5 flex flex-col gap-0.5">
                  {group.tasks.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId);
                    const category = categories.find((c) => c.id === task.categoryId);
                    const startStr = new Date(task.startTime).toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const endStr = task.endTime
                      ? new Date(task.endTime).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—";
                    const isSelected = selectedIds.has(task.id);
                    const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

                    return (
                      <TaskRow
                        key={task.id}
                        title={task.name ?? "(sem nome)"}
                        subtitle={subtitle || undefined}
                        meta={
                          <span className="text-xs font-mono tabular-nums text-fg-muted">
                            {startStr}–{endStr}
                          </span>
                        }
                        duration={formatHHMMSS(task.durationSeconds ?? 0)}
                        billable={task.billable}
                        dotColor={getProjectColor(task.projectId)}
                        selected={isSelected}
                        onClick={selectMode ? () => toggleSelectTask(task.id) : undefined}
                        leading={
                          selectMode ? (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectTask(task.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Selecionar ${task.name ?? "(sem nome)"}`}
                              className="w-3.5 h-3.5 accent-accent cursor-pointer"
                            />
                          ) : undefined
                        }
                        actions={
                          selectMode ? undefined : (
                            <>
                              <button
                                onClick={() => setEditingTask(task)}
                                className="p-1.5 text-fg-muted hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
                                title="Editar"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                onClick={() => void remove(task.id)}
                                className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
                                title="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )
                        }
                      />
                    );
                  })}
                </div>
              </div>
            ))}
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
