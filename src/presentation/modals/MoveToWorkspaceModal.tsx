import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, X } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import {
  reconcileCatalog,
  type CatalogResolution,
} from "@domain/usecases/workspaces/reconcileCatalog";
import { moveTasksToWorkspace } from "@domain/usecases/tasks/MoveTasksToWorkspace";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { WorkspaceDot } from "@presentation/components/WorkspaceDot";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface MoveToWorkspaceModalProps {
  tasks: Task[];
  /** Catálogo do workspace de origem, para resolver os nomes exibidos. */
  projects: Project[];
  categories: Category[];
  onMoved: (count: number) => void;
  onClose: () => void;
}

type Kind = CatalogResolution["kind"];

/** Uma linha de reconciliação (projeto ou categoria). */
function ResolutionRow({
  label,
  sourceName,
  suggestion,
  kind,
  onKindChange,
  destinationName,
}: {
  label: string;
  sourceName: string | null;
  suggestion: CatalogResolution;
  kind: Kind;
  onKindChange: (k: Kind) => void;
  destinationName: string | null;
}) {
  const options: [Kind, string][] = [
    ...(suggestion.kind === "match"
      ? ([["match", `Usar "${destinationName}" do destino`]] as [Kind, string][])
      : []),
    ...(sourceName ? ([["create", `Criar "${sourceName}" no destino`]] as [Kind, string][]) : []),
    ["unset", "Deixar vazio"],
  ];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-fg-muted">{label}</span>
      {sourceName ? (
        <>
          <span className="text-xs text-fg-secondary">
            Na origem: <span className="text-fg">{sourceName}</span>
          </span>
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as Kind)}
            className="bg-raised border border-border rounded-control px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
          >
            {options.map(([k, text]) => (
              <option key={k} value={k}>
                {text}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-xs text-fg-muted">Sem {label.toLowerCase()} na origem.</span>
      )}
    </div>
  );
}

/**
 * Mover ou copiar tarefas entre workspaces.
 *
 * Projeto e categoria são escopados, então os ids da origem não valem no
 * destino — o modal carrega o catálogo do destino explicitamente e propõe a
 * reconciliação (`reconcileCatalog`), que o usuário pode trocar.
 */
export function MoveToWorkspaceModal({
  tasks,
  projects,
  categories,
  onMoved,
  onClose,
}: MoveToWorkspaceModalProps) {
  const { taskRepo, projectRepo, categoryRepo } = useRepositories();
  const { workspaces, activeWorkspaceId } = useWorkspaces();

  const others = useMemo(
    () => workspaces.filter((w) => w.id !== activeWorkspaceId),
    [workspaces, activeWorkspaceId]
  );

  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const [mode, setMode] = useState<"move" | "copy">("move");
  const [destProjects, setDestProjects] = useState<Project[]>([]);
  const [destCategories, setDestCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [projectKind, setProjectKind] = useState<Kind>("unset");
  const [categoryKind, setCategoryKind] = useState<Kind>("unset");

  // As tarefas selecionadas compartilham projeto/categoria quando vêm de um
  // grupo; para uma seleção heterogênea, a primeira dita a reconciliação.
  const first = tasks[0];
  const sourceProjectName = projects.find((p) => p.id === first?.projectId)?.name ?? null;
  const sourceCategoryName = categories.find((c) => c.id === first?.categoryId)?.name ?? null;

  useEscapeToClose(onClose);
  const handleKeyDown = useSubmitOnEnter(() => void handleConfirm(), {
    disabled: busy || loading || others.length === 0,
  });

  useEffect(() => {
    if (!targetId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [ps, cs] = await Promise.all([
        projectRepo.findAll(targetId),
        categoryRepo.findAll(targetId),
      ]);
      if (cancelled) return;
      setDestProjects(ps);
      setDestCategories(cs);
      setProjectKind(reconcileCatalog(sourceProjectName, ps).kind);
      setCategoryKind(reconcileCatalog(sourceCategoryName, cs).kind);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [targetId, projectRepo, categoryRepo, sourceProjectName, sourceCategoryName]);

  const projectSuggestion = reconcileCatalog(sourceProjectName, destProjects);
  const categorySuggestion = reconcileCatalog(sourceCategoryName, destCategories);

  function toResolution(
    kind: Kind,
    suggestion: CatalogResolution,
    name: string | null
  ): CatalogResolution {
    if (kind === "match" && suggestion.kind === "match") return suggestion;
    if (kind === "create" && name) return { kind: "create", name };
    return { kind: "unset" };
  }

  async function handleConfirm() {
    if (busy || !targetId) return;
    setBusy(true);
    setError(null);
    try {
      const count = await moveTasksToWorkspace(
        { taskRepo, projectRepo, categoryRepo },
        tasks,
        {
          toWorkspaceId: targetId,
          project: toResolution(projectKind, projectSuggestion, sourceProjectName),
          category: toResolution(categoryKind, categorySuggestion, sourceCategoryName),
          mode,
        },
        new Date().toISOString()
      );
      onMoved(count);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível mover as tarefas.");
      setBusy(false);
    }
  }

  const target = workspaces.find((w) => w.id === targetId) ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
      <div
        onKeyDown={handleKeyDown}
        className="bg-surface border border-border-subtle rounded-card w-full max-w-md shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-fg">
            {mode === "move" ? "Mover" : "Copiar"} {tasks.length}{" "}
            {tasks.length === 1 ? "tarefa" : "tarefas"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-fg-muted hover:text-fg-secondary rounded-control"
          >
            <X size={16} />
          </button>
        </div>

        {others.length === 0 ? (
          <p className="px-5 py-6 text-sm text-fg-muted text-center">
            Não há outro workspace para onde mover. Crie um em Dados → Workspaces.
          </p>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex gap-1.5">
              {(
                [
                  ["move", "Mover", <ArrowRight key="m" size={14} />],
                  ["copy", "Copiar", <Copy key="c" size={14} />],
                ] as const
              ).map(([k, label, icon]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-medium border transition-colors ${
                    mode === k
                      ? "bg-accent/10 border-accent/40 text-accent-text"
                      : "bg-surface border-border text-fg-secondary hover:text-fg"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-fg-muted">Destino</span>
              <div className="flex items-center gap-2">
                {target && <WorkspaceDot color={target.color} />}
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="flex-1 bg-raised border border-border rounded-control px-2 py-1.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {others.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loading ? (
              <p className="text-xs text-fg-muted">Carregando catálogo do destino...</p>
            ) : (
              <>
                <ResolutionRow
                  label="Projeto"
                  sourceName={sourceProjectName}
                  suggestion={projectSuggestion}
                  kind={projectKind}
                  onKindChange={setProjectKind}
                  destinationName={
                    projectSuggestion.kind === "match"
                      ? (destProjects.find((p) => p.id === projectSuggestion.targetId)?.name ??
                        null)
                      : null
                  }
                />
                <ResolutionRow
                  label="Categoria"
                  sourceName={sourceCategoryName}
                  suggestion={categorySuggestion}
                  kind={categoryKind}
                  onKindChange={setCategoryKind}
                  destinationName={
                    categorySuggestion.kind === "match"
                      ? (destCategories.find((c) => c.id === categorySuggestion.targetId)?.name ??
                        null)
                      : null
                  }
                />
              </>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-fg-secondary hover:text-fg">
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy || loading || others.length === 0}
            className="px-3 py-1.5 text-sm bg-accent hover:opacity-90 disabled:opacity-40 text-white rounded-control transition"
          >
            {busy ? "Aplicando..." : mode === "move" ? "Mover" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
