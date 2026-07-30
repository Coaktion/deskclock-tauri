import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import { importMondayProjects } from "@domain/usecases/monday/importMondayProjects";
import { parseStatusLabels } from "@domain/usecases/monday/resolveBoardActivitiesColumns";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayCategoryMapping, MondayProjectMapping } from "@shared/types/mondayConfig";
import { showToast } from "@shared/utils/toast";
import { ChevronDown, ChevronRight, ListChecks, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

interface StatusLabels {
  activityType: string[];
  projectStage: string[];
}

const EMPTY_LABELS: StatusLabels = { activityType: [], projectStage: [] };

export function MondayMappingsSection({
  projects,
  categories,
  reloadProjects,
}: {
  projects: Project[];
  categories: Category[];
  reloadProjects: () => Promise<void>;
}) {
  const { projectRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const [projectMapping, setProjectMapping] = useState<MondayProjectMapping[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<MondayCategoryMapping[]>([]);
  const [labels, setLabels] = useState<StatusLabels>(EMPTY_LABELS);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const workspaceId = config.get("mondayActiveWorkspaceId");

  useEffect(() => {
    if (!config.isLoaded) return;
    setProjectMapping(
      config.get("mondayProjectMapping").filter((m) => m.workspaceId === workspaceId)
    );
    setCategoryMapping(
      config.get("mondayCategoryMapping").filter((m) => m.workspaceId === workspaceId)
    );
    // Relê os mapeamentos só quando a config carrega ou o workspace muda;
    // `config` muda de identidade a cada set() e sobrescreveria edições em curso.
  }, [config.isLoaded, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Os rótulos de Activity Type/Project Stage vêm do board — basta ler o schema
   * de um dos mapeados, já que todos nascem do mesmo template.
   */
  useEffect(() => {
    const reference = projectMapping[0];
    if (!reference) {
      setLabels(EMPTY_LABELS);
      return;
    }
    let cancelled = false;
    factories
      .createMondayApi()
      .getBoardSchema(reference.mondayBoardId)
      .then((schema) => {
        if (cancelled) return;
        const byId = (id?: string) => schema.columns.find((c) => c.id === id);
        setLabels({
          activityType: parseStatusLabels(byId(reference.columnIds.activityType)),
          projectStage: parseStatusLabels(byId(reference.columnIds.projectStage)),
        });
      })
      .catch(() => {
        // sem rótulos remotos os selects ficam vazios; o mapeamento segue editável
      });
    return () => {
      cancelled = true;
    };
  }, [projectMapping, factories]);

  async function handleImportProjects() {
    setImporting(true);
    setProgress({ done: 0, total: 0 });
    try {
      const { mappings, skipped } = await importMondayProjects({
        api: factories.createMondayApi(),
        projectRepo,
        workspaceId,
        folderId: config.get("mondayProjectsFolderId"),
        onProgress: (done, total) => setProgress({ done, total }),
      });

      const otherWorkspaces = config
        .get("mondayProjectMapping")
        .filter((m) => m.workspaceId !== workspaceId);
      await config.set("mondayProjectMapping", [...otherWorkspaces, ...mappings]);
      setProjectMapping(mappings);
      await reloadProjects();

      await showToast(
        skipped.length > 0 ? "warning" : "success",
        skipped.length > 0
          ? `${mappings.length} projeto(s) importado(s); ${skipped.length} board(s) fora do template.`
          : `${mappings.length} projeto(s) importado(s).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar projetos.");
    } finally {
      setImporting(false);
      setProgress(null);
    }
  }

  async function updateCategoryMapping(
    deskclockCategoryId: string,
    patch: Partial<Pick<MondayCategoryMapping, "activityTypeLabel" | "projectStageLabel">>
  ) {
    const all = config.get("mondayCategoryMapping");
    const current = all.find(
      (m) => m.workspaceId === workspaceId && m.deskclockCategoryId === deskclockCategoryId
    );
    const rest = all.filter(
      (m) => !(m.workspaceId === workspaceId && m.deskclockCategoryId === deskclockCategoryId)
    );
    const next: MondayCategoryMapping = {
      deskclockCategoryId,
      activityTypeLabel: current?.activityTypeLabel ?? "",
      ...(current?.projectStageLabel ? { projectStageLabel: current.projectStageLabel } : {}),
      workspaceId,
      ...patch,
    };
    const updated = next.activityTypeLabel || next.projectStageLabel ? [...rest, next] : rest;
    await config.set("mondayCategoryMapping", updated);
    setCategoryMapping(updated.filter((m) => m.workspaceId === workspaceId));
  }

  return (
    <div className="border-t border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-gray-500">
          <ListChecks size={15} />
        </span>
        <span className="text-sm font-medium text-gray-200">Mapeamentos</span>
        <span className="ml-auto text-gray-600">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          {/* Projetos ↔ boards */}
          <div className="border border-gray-800 rounded-lg">
            <button
              onClick={() => setProjectsOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left bg-gray-800/40 hover:bg-gray-800/60 transition-colors"
            >
              <span className="text-xs font-medium text-gray-300">Projetos</span>
              <span className="text-xs text-gray-600 ml-1">
                ({projectMapping.length}/{projects.length})
              </span>
              <span className="ml-auto text-gray-600">
                {projectsOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </button>
            {projectsOpen && (
              <div className="p-3">
                <div className="flex items-center justify-between mb-2 gap-3">
                  <p className="text-[11px] text-gray-500">
                    Importar cria um projeto por board e guarda onde as horas serão gravadas.
                  </p>
                  <button
                    onClick={handleImportProjects}
                    disabled={importing || !workspaceId}
                    className="shrink-0 flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors"
                  >
                    {importing && <Loader2 size={10} className="animate-spin" />}
                    Importar do Monday
                  </button>
                </div>
                {progress && progress.total > 0 && (
                  <p className="text-[11px] text-gray-500 mb-2">
                    Lendo boards: {progress.done}/{progress.total}
                  </p>
                )}
                {projectMapping.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Nenhum projeto vinculado ainda.</p>
                ) : (
                  <div className="space-y-1">
                    {projectMapping.map((m) => (
                      <div key={m.mondayBoardId} className="flex items-center gap-3 py-1">
                        <span className="text-xs text-gray-300 flex-1 truncate">
                          {projects.find((p) => p.id === m.deskclockProjectId)?.name ??
                            m.mondayBoardName}
                        </span>
                        <span className="text-xs text-gray-500 truncate max-w-[45%]">
                          {m.mondayBoardName}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Categorias ↔ Activity Type / Project Stage */}
          <div className="border border-gray-800 rounded-lg">
            <button
              onClick={() => setCategoriesOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left bg-gray-800/40 hover:bg-gray-800/60 transition-colors rounded-lg"
            >
              <span className="text-xs font-medium text-gray-300">Categorias para atividades</span>
              <span className="text-xs text-gray-600 ml-1">
                ({categoryMapping.length}/{categories.length})
              </span>
              <span className="ml-auto text-gray-600">
                {categoriesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </button>
            {categoriesOpen && (
              <div className="p-3 pt-0">
                <p className="text-[11px] text-gray-500 mb-2">
                  Define o Activity Type e, opcionalmente, o Project Stage de cada atividade criada.
                </p>
                {categories.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Nenhuma categoria no DeskClock.</p>
                ) : labels.activityType.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">
                    Importe os projetos para carregar os rótulos do board.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {categories.map((c) => {
                      const mapped = categoryMapping.find((m) => m.deskclockCategoryId === c.id);
                      return (
                        <div key={c.id} className="flex items-center gap-2 py-1">
                          <span className="text-xs text-gray-300 flex-1 truncate">{c.name}</span>
                          <select
                            value={mapped?.activityTypeLabel ?? ""}
                            onChange={(e) =>
                              updateCategoryMapping(c.id, { activityTypeLabel: e.target.value })
                            }
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500 max-w-[130px]"
                          >
                            <option value="">Activity Type…</option>
                            {labels.activityType.map((l) => (
                              <option key={l} value={l}>
                                {l}
                              </option>
                            ))}
                          </select>
                          {labels.projectStage.length > 0 && (
                            <select
                              value={mapped?.projectStageLabel ?? ""}
                              onChange={(e) =>
                                updateCategoryMapping(c.id, { projectStageLabel: e.target.value })
                              }
                              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-blue-500 max-w-[130px]"
                            >
                              <option value="">Project Stage…</option>
                              {labels.projectStage.map((l) => (
                                <option key={l} value={l}>
                                  {l}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
