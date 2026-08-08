import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy } from "lucide-react";
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
import { Button, Modal, Select } from "@presentation/components/ui";
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
          <Select
            aria-label={label}
            value={kind}
            onChange={(e) => onKindChange(e.target.value as Kind)}
          >
            {options.map(([k, text]) => (
              <option key={k} value={k}>
                {text}
              </option>
            ))}
          </Select>
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
    <Modal
      title={`${mode === "move" ? "Mover" : "Copiar"} ${tasks.length} ${
        tasks.length === 1 ? "tarefa" : "tarefas"
      }`}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      bodyClassName="flex flex-col gap-4"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleConfirm()}
            disabled={loading || others.length === 0}
            loading={busy}
          >
            {busy ? "Aplicando..." : mode === "move" ? "Mover" : "Copiar"}
          </Button>
        </>
      }
    >
      {others.length === 0 ? (
        <p className="py-2 text-sm text-fg-muted text-center">
          Não há outro workspace para onde mover. Crie um em Dados → Workspaces.
        </p>
      ) : (
        <>
          {/* Alternância entre duas ações, escrita como o botão "Filtros" do
              Histórico: aceso é `accent`, apagado é `secondary`. */}
          <div className="flex gap-1.5">
            {(
              [
                ["move", "Mover", <ArrowRight key="m" size={14} />],
                ["copy", "Copiar", <Copy key="c" size={14} />],
              ] as const
            ).map(([k, label, icon]) => (
              <Button
                key={k}
                variant={mode === k ? "accent" : "secondary"}
                onClick={() => setMode(k)}
                icon={icon}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-fg-muted">Destino</span>
            <div className="flex items-center gap-2">
              {target && <WorkspaceDot color={target.color} />}
              <Select
                aria-label="Workspace de destino"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="flex-1"
              >
                {others.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </Select>
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
                    ? (destProjects.find((p) => p.id === projectSuggestion.targetId)?.name ?? null)
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
        </>
      )}
    </Modal>
  );
}
