import { useState, useEffect } from "react";
import { Search, Pencil, Trash2, FileDown, Filter } from "lucide-react";
import { useHistory, type QuickFilter, type DayGroup } from "@presentation/hooks/useHistory";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { ExportModal } from "@presentation/modals/ExportModal";
import { formatHHMMSS, formatHHMM, formatHistoryDayHeader } from "@shared/utils/time";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

function Timeline({ tasks }: { tasks: Task[] }) {
  const parseMinutes = (iso: string) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  const dayStart = 6 * 60;
  const dayEnd = 22 * 60;
  const dayRange = dayEnd - dayStart;

  const totalSeconds = tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);
  const billableSeconds = tasks
    .filter((t) => t.billable)
    .reduce((s, t) => s + (t.durationSeconds ?? 0), 0);
  const nonBillableSeconds = totalSeconds - billableSeconds;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            Linha do tempo
          </div>
          <div className="font-mono text-base text-gray-100 mt-0.5">
            {formatHHMMSS(totalSeconds)}
          </div>
        </div>
        <div className="flex gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />
            Billable {formatHHMM(billableSeconds)}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-gray-500" />
            Non-billable {formatHHMM(nonBillableSeconds)}
          </span>
        </div>
      </div>
      <div className="relative h-11 bg-gray-950 rounded overflow-hidden">
        {tasks.map((task) => {
          if (!task.endTime) return null;
          const start = parseMinutes(task.startTime);
          const end = parseMinutes(task.endTime);
          const left = Math.max(0, ((start - dayStart) / dayRange) * 100);
          const width = Math.max(0.5, ((end - start) / dayRange) * 100);
          const color = task.billable ? "#10b981" : "#64748b";
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
              style={{ left: `${left}%`, width: `${width}%`, background: color }}
              title={`${task.name ?? "(sem nome)"} · ${startStr}–${endStr}`}
            />
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        {[6, 8, 10, 12, 14, 16, 18, 20, 22].map((h) => (
          <span key={h} className="text-[9px] font-mono text-gray-600">
            {String(h).padStart(2, "0")}h
          </span>
        ))}
      </div>
    </div>
  );
}

function ProjectDistribution({
  groups,
  projects,
}: {
  groups: DayGroup[];
  projects: Project[];
}) {
  const totals: Record<string, { name: string; seconds: number }> = {};
  groups.forEach((g) =>
    g.tasks.forEach((t) => {
      const key = t.projectId ?? "__none__";
      const name = t.projectId
        ? (projects.find((p) => p.id === t.projectId)?.name ?? "—")
        : "Sem projeto";
      if (!totals[key]) totals[key] = { name, seconds: 0 };
      totals[key].seconds += t.durationSeconds ?? 0;
    })
  );
  const list = Object.values(totals).sort((a, b) => b.seconds - a.seconds);
  if (list.length === 0) return null;
  const max = Math.max(...list.map((x) => x.seconds));

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">
        Por projeto
      </div>
      <div className="flex flex-col gap-2">
        {list.map((x) => {
          const h = Math.floor(x.seconds / 3600);
          const m = Math.floor((x.seconds % 3600) / 60);
          return (
            <div key={x.name} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-500" />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-200 truncate pr-2">{x.name}</span>
                  <span className="font-mono text-gray-400 shrink-0">
                    {h}h{String(m).padStart(2, "0")}
                  </span>
                </div>
                <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-slate-500 rounded-full"
                    style={{ width: `${(x.seconds / max) * 100}%` }}
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

  useEffect(() => {
    void search(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch() {
    void search(filters);
  }

  function handleQuick(quick: QuickFilter) {
    setQuick(quick);
    void search({ ...filters, quick });
  }

  const allTasks = groups.flatMap((g) => g.tasks);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar: pills + Filtros + Exportar */}
      <div className="flex items-center gap-1.5 px-4 pt-3 pb-3 border-b border-gray-800 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {(["today", "7days", "30days", "month", "custom"] as QuickFilter[]).map((q) => (
            <button
              key={q}
              onClick={() => handleQuick(q)}
              className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                filters.quick === q
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
              }`}
            >
              {QUICK_LABELS[q]}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => setAdvancedOpen((o) => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors ${
              advancedOpen
                ? "bg-gray-800 border-gray-600 text-gray-200"
                : "bg-transparent border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600"
            }`}
          >
            <Filter size={11} />
            Filtros
          </button>
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-transparent border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-600 rounded-lg transition-colors"
          >
            <FileDown size={11} />
            Exportar
          </button>
        </div>
      </div>

      {/* Advanced filters panel */}
      {advancedOpen && (
        <div className="flex flex-col gap-2 px-4 py-3 border-b border-gray-800">
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
            <span className="self-center text-gray-500 text-sm">→</span>
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
              onChange={(e) =>
                updateFilter("billable", e.target.value as "all" | "yes" | "no")
              }
              className="px-2.5 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 cursor-pointer"
            >
              <option value="all">Billable: Todos</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select>
          </div>
          <button
            onClick={handleSearch}
            className="flex items-center justify-center gap-1.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <Search size={12} />
            Buscar
          </button>
        </div>
      )}

      {/* Search input */}
      <div className="relative px-4 py-2.5 border-b border-gray-800">
        <Search
          size={13}
          className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <input
          type="text"
          value={filters.name}
          onChange={(e) => updateFilter("name", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearch();
          }}
          placeholder="Buscar por tarefa, projeto, categoria…"
          className="w-full pl-8 pr-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Timeline + ProjectDistribution grid */}
        {searched && allTasks.length > 0 && (
          <div className="grid grid-cols-[1.5fr_1fr] gap-2.5 p-4 border-b border-gray-800">
            <Timeline tasks={allTasks} />
            <ProjectDistribution groups={groups} projects={projects} />
          </div>
        )}

        {/* KPIs */}
        {searched && (
          <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-gray-800">
            {[
              { label: "Total", value: formatHHMMSS(totals.totalSeconds), color: "text-gray-100" },
              {
                label: "Billable",
                value: formatHHMMSS(totals.billableSeconds),
                color: "text-emerald-400",
              },
              {
                label: "Non-billable",
                value: formatHHMMSS(totals.nonBillableSeconds),
                color: "text-gray-300",
              },
              { label: "Registros", value: String(totals.count), color: "text-gray-300" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex flex-col gap-0.5"
              >
                <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                  {label}
                </span>
                <span className={`text-sm font-mono font-medium ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Empty states */}
        {searched && groups.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-12">Nenhum registro encontrado</p>
        )}
        {!searched && (
          <p className="text-center text-gray-600 text-sm py-12">
            Use os filtros acima para buscar registros
          </p>
        )}

        {/* Entries section head */}
        {searched && groups.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              Entradas
            </span>
          </div>
        )}

        {/* Day groups */}
        {groups.map((group) => (
          <div key={group.dateISO}>
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/60 border-b border-gray-800 sticky top-0 z-10">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                {formatHistoryDayHeader(group.dateISO)}
              </span>
              <span className="text-xs font-mono text-gray-500">
                {formatHHMM(group.totalSeconds)}
              </span>
            </div>

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
              return (
                <div
                  key={task.id}
                  className="grid grid-cols-[88px_1fr_auto_auto] items-center gap-2 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        task.billable ? "bg-emerald-500" : "bg-gray-600"
                      }`}
                    />
                    <span className="text-xs font-mono text-gray-400 tabular-nums">
                      {startStr}–{endStr}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-100 truncate">{task.name ?? "(sem nome)"}</p>
                    {(project || category) && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {[project?.name, category?.name].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  <span className="text-sm font-mono text-gray-400 shrink-0">
                    {formatHHMMSS(task.durationSeconds ?? 0)}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => setEditingTask(task)}
                      className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded transition-colors"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => void remove(task.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {exportOpen && (
        <ExportModal
          projects={projects}
          categories={categories}
          onClose={() => setExportOpen(false)}
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
