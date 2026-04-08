import { useState } from "react";
import { Search, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { useHistory, type QuickFilter } from "@presentation/hooks/useHistory";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { formatHHMMSS, formatHHMM, formatHistoryDayHeader } from "@shared/utils/time";
import type { Task } from "@domain/entities/Task";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today:   "Hoje",
  "7days": "7 dias",
  "30days":"30 dias",
  month:   "Este mês",
  custom:  "Personalizado",
};

export function HistoryPage() {
  const { filters, groups, totals, searched, search, updateFilter, setQuick, remove, reload } = useHistory();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");

  function handleSearch() {
    void search(filters);
  }

  function handleQuick(quick: QuickFilter) {
    setQuick(quick);
    void search({ ...filters, quick });
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filtros */}
      <div className="flex flex-col gap-3 p-4 border-b border-gray-700">
        {/* Filtros rápidos */}
        <div className="flex gap-1 flex-wrap">
          {(["today", "7days", "30days", "month"] as QuickFilter[]).map((q) => (
            <button
              key={q}
              onClick={() => handleQuick(q)}
              className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                filters.quick === q
                  ? "bg-blue-900/40 border-blue-600 text-blue-300"
                  : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {QUICK_LABELS[q]}
            </button>
          ))}
          <button
            onClick={() => setAdvancedOpen((o) => !o)}
            className={`ml-auto px-3 py-1.5 text-xs rounded border transition-colors flex items-center gap-1 ${
              advancedOpen
                ? "bg-gray-700 border-gray-600 text-gray-200"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
            }`}
          >
            Avançado {advancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Filtros avançados */}
        {advancedOpen && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <DatePickerInput
                value={filters.startDate}
                onChange={(v) => { updateFilter("startDate", v); updateFilter("quick", "custom"); }}
                placeholder="Início"
                className="flex-1"
              />
              <span className="self-center text-gray-500 text-sm">→</span>
              <DatePickerInput
                value={filters.endDate}
                onChange={(v) => { updateFilter("endDate", v); updateFilter("quick", "custom"); }}
                placeholder="Fim"
                className="flex-1"
              />
            </div>
            <input
              type="text"
              value={filters.name}
              onChange={(e) => updateFilter("name", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Nome da tarefa"
              className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <Autocomplete
                value={projectName}
                onChange={(v) => { setProjectName(v); if (!v) updateFilter("projectId", null); }}
                onSelect={(o) => { setProjectName(o.name); updateFilter("projectId", o.id); }}
                options={projects}
                placeholder="Projeto"
                className="flex-1"
              />
              <Autocomplete
                value={categoryName}
                onChange={(v) => { setCategoryName(v); if (!v) updateFilter("categoryId", null); }}
                onSelect={(o) => { setCategoryName(o.name); updateFilter("categoryId", o.id); }}
                options={categories}
                placeholder="Categoria"
                className="flex-1"
              />
              <select
                value={filters.billable}
                onChange={(e) => updateFilter("billable", e.target.value as "all" | "yes" | "no")}
                className="px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">Billable: Todos</option>
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </select>
            </div>
          </div>
        )}

        <button
          onClick={handleSearch}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium transition-colors"
        >
          <Search size={14} />
          Buscar
        </button>
      </div>

      {/* Totalizadores */}
      {searched && (
        <div className="grid grid-cols-4 gap-px bg-gray-700 border-b border-gray-700 shrink-0">
          {[
            { label: "Total",       value: formatHHMMSS(totals.totalSeconds) },
            { label: "Billable",    value: formatHHMMSS(totals.billableSeconds) },
            { label: "Non-billable",value: formatHHMMSS(totals.nonBillableSeconds) },
            { label: "Registros",   value: String(totals.count) },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center py-3 bg-gray-950">
              <span className="text-xs text-gray-500">{label}</span>
              <span className="text-sm font-mono font-medium text-gray-200 mt-0.5">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {searched && groups.length === 0 && (
          <p className="text-center text-gray-500 text-sm py-12">Nenhum registro encontrado</p>
        )}

        {!searched && (
          <p className="text-center text-gray-600 text-sm py-12">Use os filtros acima para buscar registros</p>
        )}

        {groups.map((group) => (
          <div key={group.dateISO}>
            {/* Header do grupo */}
            <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
              <span className="text-xs font-medium text-gray-300">
                {formatHistoryDayHeader(group.dateISO)}
              </span>
              <span className="text-xs font-mono text-gray-400">
                {formatHHMM(group.totalSeconds)}
              </span>
            </div>

            {/* Tarefas do grupo */}
            {group.tasks.map((task) => {
              const project = projects.find((p) => p.id === task.projectId);
              const category = categories.find((c) => c.id === task.categoryId);
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group"
                >
                  {/* Indicador billable */}
                  <div
                    className={`w-1 h-8 rounded-full shrink-0 ${task.billable ? "bg-blue-500" : "bg-gray-600"}`}
                    title={task.billable ? "Billable" : "Non-billable"}
                  />

                  {/* Dados */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-100 truncate">{task.name ?? "(sem nome)"}</p>
                    {(project || category) && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {[project?.name, category?.name].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>

                  {/* Duração */}
                  <span className="text-sm font-mono text-gray-400 shrink-0">
                    {formatHHMMSS(task.durationSeconds ?? 0)}
                  </span>

                  {/* Ações */}
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

      {/* Modal de edição */}
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
