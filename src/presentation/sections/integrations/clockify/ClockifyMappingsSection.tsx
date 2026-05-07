import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { TagMultiSelect } from "@presentation/components/TagMultiSelect";
import { showToast } from "@shared/utils/toast";
import type {
  ClockifyCategoryMapping,
  ClockifyProjectMapping,
} from "@shared/types/clockifyConfig";
import { ChevronDown, ChevronRight, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ProjectMappingRow } from "./ProjectMappingRow";

interface ClockifyRef {
  id: string;
  name: string;
}

async function runClockifyImport<TItem, TMapping extends { workspaceId: string }>({
  fetchItems,
  onFetched,
  buildMapping,
  getAllMappings,
  setAllMappings,
  workspaceId,
  setLocalMappings,
  reload,
  successMessage,
}: {
  fetchItems: () => Promise<TItem[]>;
  onFetched?: (list: TItem[]) => void;
  buildMapping: (item: TItem) => Promise<TMapping | null>;
  getAllMappings: () => TMapping[];
  setAllMappings: (mappings: TMapping[]) => Promise<void>;
  workspaceId: string;
  setLocalMappings: (mappings: TMapping[]) => void;
  reload: () => Promise<void>;
  successMessage: (count: number) => string;
}): Promise<void> {
  const list = await fetchItems();
  onFetched?.(list);
  const otherWS = getAllMappings().filter((m) => m.workspaceId !== workspaceId);
  const newMappings: TMapping[] = [];
  for (const item of list) {
    const mapping = await buildMapping(item);
    if (mapping) newMappings.push(mapping);
  }
  const merged = [...otherWS, ...newMappings];
  await setAllMappings(merged);
  setLocalMappings(newMappings);
  await reload();
  await showToast("success", successMessage(list.length));
}

export function ClockifyMappingsSection({
  projects,
  categories,
  reloadProjects,
  reloadCategories,
}: {
  projects: import("@domain/entities/Project").Project[];
  categories: import("@domain/entities/Category").Category[];
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
}) {
  const { projectRepo, categoryRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const [clockifyProjects, setClockifyProjects] = useState<ClockifyRef[]>([]);
  const [clockifyTags, setClockifyTags] = useState<ClockifyRef[]>([]);
  const [projectMapping, setProjectMapping] = useState<ClockifyProjectMapping[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<ClockifyCategoryMapping[]>([]);
  const [defaultTagIds, setDefaultTagIds] = useState<string[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTags, setLoadingTags] = useState(false);
  const [importingProjects, setImportingProjects] = useState(false);
  const [importingTags, setImportingTags] = useState(false);
  const [open, setOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  const workspaceId = config.get("clockifyActiveWorkspaceId");

  useEffect(() => {
    if (!config.isLoaded) return;
    const allPM = config.get("clockifyProjectMapping");
    setProjectMapping(allPM.filter((m) => m.workspaceId === workspaceId));
    const allCM = config.get("clockifyCategoryMapping");
    setCategoryMapping(allCM.filter((m) => m.workspaceId === workspaceId));
    setDefaultTagIds(config.get("clockifyDefaultTagIds"));
  }, [config.isLoaded, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  function getClient() {
    return factories.createClockifyApi();
  }

  function projectDisplayName(p: { name: string; clientName?: string | null }) {
    return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
  }

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const client = getClient();
      const list = await client.listProjects(workspaceId);
      setClockifyProjects(
        list
          .map((p) => ({ id: p.id, name: projectDisplayName(p) }))
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
      );
    } catch {
      // erro silencioso
    } finally {
      setLoadingProjects(false);
    }
  }

  async function fetchTags() {
    setLoadingTags(true);
    try {
      const client = getClient();
      const list = await client.listTags(workspaceId);
      setClockifyTags(list.map((t) => ({ id: t.id, name: t.name })));
    } finally {
      setLoadingTags(false);
    }
  }

  async function handleImportProjects() {
    if (clockifyProjects.length === 0) await fetchProjects();
    setImportingProjects(true);
    try {
      const { createProject: createProjectUC } =
        await import("@domain/usecases/projects/CreateProject");
      await runClockifyImport({
        fetchItems: () => getClient().listProjects(workspaceId),
        onFetched: (list) =>
          setClockifyProjects(
            list
              .map((p) => ({ id: p.id, name: projectDisplayName(p) }))
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
          ),
        buildMapping: async (cp): Promise<ClockifyProjectMapping | null> => {
          let proj = await projectRepo.findByName(cp.name);
          if (!proj) {
            try {
              proj = await createProjectUC(projectRepo, cp.name);
            } catch {
              proj = await projectRepo.findByName(cp.name);
            }
          }
          if (!proj) return null;
          return {
            deskclockProjectId: proj.id,
            clockifyProjectId: cp.id,
            clockifyProjectName: projectDisplayName(cp),
            workspaceId,
          };
        },
        getAllMappings: () => config.get("clockifyProjectMapping"),
        setAllMappings: (merged) => config.set("clockifyProjectMapping", merged),
        workspaceId,
        setLocalMappings: setProjectMapping,
        reload: reloadProjects,
        successMessage: (n) => `${n} projeto(s) importado(s).`,
      });
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar projetos.");
    } finally {
      setImportingProjects(false);
    }
  }

  async function handleImportTags() {
    if (clockifyTags.length === 0) await fetchTags();
    setImportingTags(true);
    try {
      const { createCategory: createCategoryUC } =
        await import("@domain/usecases/categories/CreateCategory");
      const allCMSnapshot = config.get("clockifyCategoryMapping");
      await runClockifyImport({
        fetchItems: () => getClient().listTags(workspaceId),
        onFetched: (list) => setClockifyTags(list.map((t) => ({ id: t.id, name: t.name }))),
        buildMapping: async (tag): Promise<ClockifyCategoryMapping | null> => {
          let cat = await categoryRepo.findByName(tag.name);
          if (!cat) {
            try {
              cat = await createCategoryUC(categoryRepo, tag.name, true);
            } catch {
              cat = await categoryRepo.findByName(tag.name);
            }
          }
          if (!cat) return null;
          const existingTagIds =
            allCMSnapshot.find(
              (m) => m.deskclockCategoryId === cat!.id && m.workspaceId === workspaceId
            )?.clockifyTagIds ?? [];
          return {
            deskclockCategoryId: cat.id,
            clockifyTagIds: existingTagIds.length > 0 ? existingTagIds : [tag.id],
            workspaceId,
          };
        },
        getAllMappings: () => config.get("clockifyCategoryMapping"),
        setAllMappings: (merged) => config.set("clockifyCategoryMapping", merged),
        workspaceId,
        setLocalMappings: setCategoryMapping,
        reload: reloadCategories,
        successMessage: (n) => `${n} tag(s) importada(s) como categorias.`,
      });
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar tags.");
    } finally {
      setImportingTags(false);
    }
  }

  async function updateProjectMapping(deskclockProjectId: string, clockifyProjectId: string) {
    const allPM = config.get("clockifyProjectMapping");
    const rest = allPM.filter(
      (m) => !(m.workspaceId === workspaceId && m.deskclockProjectId === deskclockProjectId)
    );
    const updated = [...rest];
    if (clockifyProjectId) {
      const cp = clockifyProjects.find((p) => p.id === clockifyProjectId);
      updated.push({
        deskclockProjectId,
        clockifyProjectId,
        clockifyProjectName: cp?.name ?? "",
        workspaceId,
      });
    }
    await config.set("clockifyProjectMapping", updated);
    setProjectMapping(updated.filter((m) => m.workspaceId === workspaceId));
  }

  async function updateCategoryMapping(deskclockCategoryId: string, tagIds: string[]) {
    const allCM = config.get("clockifyCategoryMapping");
    const rest = allCM.filter(
      (m) => !(m.workspaceId === workspaceId && m.deskclockCategoryId === deskclockCategoryId)
    );
    const updated = [...rest, { deskclockCategoryId, clockifyTagIds: tagIds, workspaceId }];
    await config.set("clockifyCategoryMapping", updated);
    setCategoryMapping(updated.filter((m) => m.workspaceId === workspaceId));
  }

  async function updateDefaultTags(ids: string[]) {
    setDefaultTagIds(ids);
    await config.set("clockifyDefaultTagIds", ids);
  }

  return (
    <div className="border-t border-gray-800">
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) {
            if (clockifyProjects.length === 0) fetchProjects();
            if (clockifyTags.length === 0) fetchTags();
          }
        }}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-gray-500"><ListChecks size={15} /></span>
        <span className="text-sm font-medium text-gray-200">Mapeamentos</span>
        <span className="ml-auto text-gray-600">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5">
          {/* Projetos */}
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
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-gray-500">
                    Importar cria projetos no DeskClock e os vincula automaticamente.
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => fetchProjects()}
                      disabled={loadingProjects}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
                      title="Atualizar lista"
                    >
                      <RefreshCw size={12} className={loadingProjects ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={handleImportProjects}
                      disabled={importingProjects}
                      className="flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      {importingProjects && <Loader2 size={10} className="animate-spin" />}
                      Importar do Clockify
                    </button>
                  </div>
                </div>
                {projects.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Nenhum projeto no DeskClock.</p>
                ) : (
                  <div className="space-y-1">
                    {projects.map((p) => (
                      <ProjectMappingRow
                        key={p.id}
                        project={p}
                        clockifyProjects={clockifyProjects}
                        mapped={projectMapping.find((m) => m.deskclockProjectId === p.id)}
                        onUpdate={updateProjectMapping}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Categorias → Tags */}
          <div className="border border-gray-800 rounded-lg overflow-visible">
            <button
              onClick={() => setCategoriesOpen((v) => !v)}
              className="flex items-center gap-2 w-full px-3 py-2.5 text-left bg-gray-800/40 hover:bg-gray-800/60 transition-colors rounded-lg"
            >
              <span className="text-xs font-medium text-gray-300">Categorias para tags</span>
              <span className="text-xs text-gray-600 ml-1">
                ({categoryMapping.length}/{categories.length})
              </span>
              <span className="ml-auto text-gray-600">
                {categoriesOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
            </button>
            {categoriesOpen && (
              <div className="p-3 pt-0">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] text-gray-500">
                    Importar cria categorias no DeskClock para cada tag e as vincula
                    automaticamente.
                  </p>
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <button
                      onClick={() => fetchTags()}
                      disabled={loadingTags}
                      className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
                      title="Atualizar lista"
                    >
                      <RefreshCw size={12} className={loadingTags ? "animate-spin" : ""} />
                    </button>
                    <button
                      onClick={handleImportTags}
                      disabled={importingTags}
                      className="flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors"
                    >
                      {importingTags && <Loader2 size={10} className="animate-spin" />}
                      Importar do Clockify
                    </button>
                  </div>
                </div>
                {categories.length === 0 ? (
                  <p className="text-xs text-gray-600 italic">Nenhuma categoria no DeskClock.</p>
                ) : (
                  <div className="space-y-1.5">
                    {categories.map((c) => {
                      const mapped = categoryMapping.find((m) => m.deskclockCategoryId === c.id);
                      return (
                        <div key={c.id} className="flex items-center gap-3 py-1">
                          <span className="text-xs text-gray-300 flex-1 truncate">{c.name}</span>
                          <TagMultiSelect
                            allTags={clockifyTags}
                            selectedIds={mapped?.clockifyTagIds ?? []}
                            onChange={(ids) => updateCategoryMapping(c.id, ids)}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tags padrão */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-300">Tags padrão</span>
            </div>
            <p className="text-[11px] text-gray-500 mb-2">
              Adicionadas em todos os envios, independente da categoria.
            </p>
            <TagMultiSelect
              allTags={clockifyTags}
              selectedIds={defaultTagIds}
              onChange={updateDefaultTags}
            />
          </div>
        </div>
      )}
    </div>
  );
}
