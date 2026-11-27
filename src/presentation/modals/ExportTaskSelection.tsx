import { Button } from "@presentation/components/ui";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";

interface ExportTaskSelectionProps {
  tasks: Task[];
  projects: Project[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}

/** Lista de seleção da aba Exportar: todas marcadas ao carregar, Todas / Nenhuma / individual. */
export function ExportTaskSelection({
  tasks,
  projects,
  selected,
  onChange,
}: ExportTaskSelectionProps) {
  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-fg-secondary">
          {selected.size} de {tasks.length} selecionadas
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onChange(new Set(tasks.map((t) => t.id)))}>
            Todas
          </Button>
          <Button variant="ghost" onClick={() => onChange(new Set())}>
            Nenhuma
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-border rounded-control p-2">
        {tasks.length === 0 && (
          <p className="text-xs text-fg-muted text-center py-2">Nenhuma tarefa no período</p>
        )}
        {tasks.map((t) => {
          const proj = projects.find((p) => p.id === t.projectId);
          return (
            <label
              key={t.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-raised px-1 py-0.5 rounded-control"
            >
              <input
                type="checkbox"
                checked={selected.has(t.id)}
                onChange={() => toggle(t.id)}
                className="accent-accent shrink-0"
              />
              <span className="text-sm text-fg-secondary truncate">{t.name ?? "(sem nome)"}</span>
              {proj && <span className="text-xs text-fg-muted truncate">{proj.name}</span>}
            </label>
          );
        })}
      </div>
    </div>
  );
}
