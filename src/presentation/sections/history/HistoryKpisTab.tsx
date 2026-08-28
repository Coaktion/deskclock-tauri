import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { HistoryTotals } from "@domain/usecases/tasks/GetHistoryTotals";
import { KpiCard } from "@presentation/components/ui";
import type { DayGroup } from "@presentation/hooks/useHistory";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatHHMMSS } from "@shared/utils/time";

import { projectColorOf } from "./projectColorOf";

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

interface HistoryKpisTabProps {
  groups: DayGroup[];
  tasks: Task[];
  projects: Project[];
  totals: HistoryTotals;
}

/**
 * A aba de KPIs do Histórico: a linha do tempo, a distribuição por projeto e a
 * fileira de quatro totalizadores. É o que o resultado da busca resume; a lista
 * de entradas é a outra aba.
 */
export function HistoryKpisTab({ groups, tasks, projects, totals }: HistoryKpisTabProps) {
  return (
    <>
      {tasks.length > 0 && (
        <div className="grid grid-cols-[1.5fr_1fr] gap-3">
          <Timeline tasks={tasks} projects={projects} />
          <ProjectDistribution groups={groups} projects={projects} />
        </div>
      )}

      <div className="flex gap-2">
        <KpiCard label="Total" value={formatHHMMSS(totals.totalSeconds)} />
        <KpiCard label="Billable" value={formatHHMMSS(totals.billableSeconds)} tone="billable" />
        <KpiCard
          label="Non-billable"
          value={formatHHMMSS(totals.nonBillableSeconds)}
          tone="muted"
        />
        <KpiCard label="Registros" value={String(totals.count)} tone="muted" />
      </div>
    </>
  );
}
