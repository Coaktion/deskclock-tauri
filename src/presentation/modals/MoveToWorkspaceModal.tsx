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
      <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
      {sourceName ? (
        <>
          <span className="text-xs text-gray-400">
            Na origem: <span className="text-gray-200">{sourceName}</span>
          </span>
          <select
            value={kind}
            onChange={(e) => onKindChange(e.target.value as Kind)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {options.map(([k, text]) => (
              <option key={k} value={k}>
                {text}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span className="text-xs text-gray-600">Sem {label.toLowerCase()} na origem.</span>
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100">
            {mode === "move" ? "Mover" : "Copiar"} {tasks.length}{" "}
            {tasks.length === 1 ? "tarefa" : "tarefas"}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {others.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500 text-center">
            Não há outro workspace para onde mover. Crie um em Dados → Workspaces.
          </p>
        ) : (
          <div className="px-5 py-4 flex flex-col gap-4">
            <div className="flex gap-1.5">
              {(
                [
                  ["move", "Mover", <ArrowRight key="m" size={13} />],
                  ["copy", "Copiar", <Copy key="c" size={13} />],
                ] as const
              ).map(([k, label, icon]) => (
                <button
                  key={k}
                  onClick={() => setMode(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    mode === k
                      ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                      : "bg-gray-900 border-gray-700 text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-gray-500">Destino</span>
              <div className="flex items-center gap-2">
                {target && <WorkspaceDot color={target.color} />}
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
              <p className="text-xs text-gray-500">Carregando catálogo do destino...</p>
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

            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy || loading || others.length === 0}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            {busy ? "Aplicando..." : mode === "move" ? "Mover" : "Copiar"}
          </button>
        </div>
      </div>
    </div>
  );
}
