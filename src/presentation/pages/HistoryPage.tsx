import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import {
  Button,
  FilterPill,
  IconButton,
  KpiCard,
  PageHeader,
  SearchInput,
  SectionCard,
  Select,
  TaskRow,
} from "@presentation/components/ui";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useHistory, type DayGroup, type QuickFilter } from "@presentation/hooks/useHistory";
import { useProjects } from "@presentation/hooks/useProjects";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { ExportModal } from "@presentation/modals/ExportModal";
import { MoveToWorkspaceModal } from "@presentation/modals/MoveToWorkspaceModal";
import { getProjectColor } from "@shared/utils/projectColor";
import {
  formatHHMM,
  formatHHMMSS,
  formatHistoryDayHeader,
  formatRegisteredTimeRange,
} from "@shared/utils/time";
import { FileDown, Filter, Pencil, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

const cardClass = "bg-surface border border-border-subtle rounded-card";
const eyebrowClass = "text-overline uppercase text-fg-muted";

/**
 * A cor de projeto sai da entidade, e aqui três blocos só têm o id em mão — a
 * linha do dia, a linha do tempo e a distribuição. Id que não está no catálogo
 * (projeto excluído) devolve `undefined` e cai no cinza de "sem projeto", que é
 * o mesmo destino do "—" que a distribuição já mostra.
 */
function projectColorOf(projects: Project[], projectId: string | null | undefined) {
  return getProjectColor(projects.find((p) => p.id === projectId));
}

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
                  style={{ backgroundColor: getProjectColor(p) }}
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
          const color = projectColorOf(projects, task.projectId);
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
          const color = projectColorOf(projects, x.id);
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

      {/* Recorte do período: fica fora do cabeçalho porque as cinco pílulas e os
          dois botões, juntos, não cabem nos 56 px sem quebrar em duas linhas. A
          busca divide a linha com as pílulas, como o spec desenha (`1/1/1/0`):
          ela é o sexto filho, em `flex-1`, e o `ml-1` é o degrau a mais que o
          design abre entre a última pílula e o campo. */}
      <div
        onKeyDown={handleKeyDown}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 border-b border-border-subtle flex-wrap"
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
              <span className="text-overline uppercase text-fg-secondary">Entradas</span>
              {selectMode ? (
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      setSelectedIds(allSelected ? new Set() : new Set(allTasks.map((t) => t.id)))
                    }
                  >
                    {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                  </Button>
                  {workspaces.length > 1 && (
                    <Button
                      variant="ghost"
                      onClick={() => setMovingTasks(allTasks.filter((t) => selectedIds.has(t.id)))}
                      disabled={selectedIds.size === 0}
                    >
                      Mover para workspace
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    onClick={() => void handleBulkDelete()}
                    disabled={selectedIds.size === 0}
                  >
                    Excluir{selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}
                  </Button>
                  <Button variant="ghost" onClick={exitSelectMode}>
                    Cancelar
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setSelectMode(true)}>
                  Selecionar tarefas
                </Button>
              )}
            </div>

            {groups.map((group) => {
              const groupIds = group.tasks.map((t) => t.id);
              const allInGroup = groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
              const someInGroup = groupIds.some((id) => selectedIds.has(id));
              const dayLabel = formatHistoryDayHeader(group.dateISO);

              return (
                <SectionCard
                  key={group.dateISO}
                  // O corpo da tela é coluna de flex *e* scrollport. O
                  // `overflow-hidden` da casca zera o mínimo automático do item
                  // de flex (`min-height: auto` só vale com overflow visível),
                  // então sem isto os cartões se espremem na altura disponível
                  // em vez de somarem e fazerem a coluna rolar.
                  className="shrink-0"
                  title={dayLabel}
                  leading={
                    selectMode && groupIds.length > 0 ? (
                      <input
                        type="checkbox"
                        checked={allInGroup}
                        // Seleção parcial: traço em vez de vazio, senão o dia com
                        // metade das linhas marcadas lê como dia sem nada marcado.
                        ref={(el) => {
                          if (el) el.indeterminate = someInGroup && !allInGroup;
                        }}
                        onChange={() =>
                          setSelectedIds((prev) => {
                            // A decisão sai de `prev`, não do closure do render:
                            // o updater tem de valer sozinho na fila do React.
                            const todas = groupIds.every((id) => prev.has(id));
                            const next = new Set(prev);
                            if (todas) groupIds.forEach((id) => next.delete(id));
                            else groupIds.forEach((id) => next.add(id));
                            return next;
                          })
                        }
                        aria-label={`Selecionar ${dayLabel}`}
                        className={selectionBoxClass}
                      />
                    ) : undefined
                  }
                  action={
                    <span className="font-mono tabular-nums text-fg-secondary">
                      {formatHHMM(group.totalSeconds)}
                    </span>
                  }
                >
                  {group.tasks.map((task) => {
                    const project = projects.find((p) => p.id === task.projectId);
                    const category = categories.find((c) => c.id === task.categoryId);
                    const isSelected = selectedIds.has(task.id);
                    const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");

                    return (
                      <TaskRow
                        key={task.id}
                        title={task.name ?? "(sem nome)"}
                        subtitle={subtitle || undefined}
                        meta={
                          <span className="text-micro font-mono tabular-nums text-fg-muted">
                            {formatRegisteredTimeRange(
                              task.startTime,
                              task.durationSeconds,
                              task.endTime
                            )}
                          </span>
                        }
                        duration={formatHHMMSS(task.durationSeconds ?? 0)}
                        billable={task.billable}
                        onToggleBillable={() => void toggleBillable(task)}
                        dotColor={projectColorOf(projects, task.projectId)}
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
                              className={selectionBoxClass}
                            />
                          ) : undefined
                        }
                        actions={
                          selectMode ? undefined : (
                            <>
                              <IconButton
                                icon={<Pencil size={14} />}
                                title="Editar"
                                size="sm"
                                onClick={() => setEditingTask(task)}
                              />
                              <IconButton
                                icon={<Trash2 size={14} />}
                                title="Excluir"
                                variant="danger"
                                size="sm"
                                onClick={() => void remove(task.id)}
                              />
                            </>
                          )
                        }
                      />
                    );
                  })}
                </SectionCard>
              );
            })}
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
