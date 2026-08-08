import { Button, IconButton } from "@presentation/components/ui";
import { SubSection } from "../shared";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { TagMultiSelect } from "@presentation/components/TagMultiSelect";
import { notifyCategoriesChanged, notifyProjectsChanged } from "@shared/utils/catalogSync";
import { showToast } from "@shared/utils/toast";
import type { ClockifyCategoryMapping, ClockifyProjectMapping } from "@shared/types/clockifyConfig";
import { ChevronDown, ChevronRight, ListChecks, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { ProjectMappingRow } from "./ProjectMappingRow";

interface ClockifyRef {
  id: string;
  name: string;
}

/**
 * Caixa recolhível de um mapeamento — título, quantos de quantos, e o corpo.
 * As duas eram escritas à mão e já discordavam: a de Projetos não tinha raio no
 * cabeçalho e a de Categorias tinha, e o corpo de uma abria com `p-3` e o da
 * outra com `p-3 pt-0`.
 *
 * O raio do cabeçalho é `rounded-t-control`, não `rounded-control`: arredondado
 * embaixo, aberto, ele abriria um entalhe acima do corpo. Fazer a caixa recortar
 * (`overflow-hidden`) não serve — a de Categorias precisa deixar o dropdown do
 * `TagMultiSelect` escapar.
 */
function MappingBox({
  title,
  count,
  total,
  open,
  onToggle,
  className = "",
  children,
}: {
  title: string;
  count: number;
  total: number;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`border border-border-subtle rounded-control ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left bg-raised hover:bg-border transition-colors rounded-t-control"
      >
        <span className="text-xs font-medium text-fg-secondary">{title}</span>
        <span className="text-xs text-fg-muted ml-1">
          ({count}/{total})
        </span>
        <span className="ml-auto text-fg-muted">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
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
  // Distinto do `workspaceId` desta tela, que é o workspace do **Clockify**.
  const deskclockWorkspaceId = resolveIntegrationWorkspaceId(
    config.get("clockifyDeskclockWorkspaceId")
  );
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
          const displayName = projectDisplayName(cp);
          let proj = await projectRepo.findByName(displayName, deskclockWorkspaceId);
          if (!proj) {
            try {
              proj = await createProjectUC(projectRepo, displayName, deskclockWorkspaceId);
            } catch {
              proj = await projectRepo.findByName(displayName, deskclockWorkspaceId);
            }
          }
          if (!proj) return null;
          return {
            deskclockProjectId: proj.id,
            clockifyProjectId: cp.id,
            clockifyProjectName: displayName,
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
      // Criados pelo repositório, fora das mutações de `useProjects` — as outras
      // janelas só ficam sabendo por este aviso.
      await notifyProjectsChanged();
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
          let cat = await categoryRepo.findByName(tag.name, deskclockWorkspaceId);
          if (!cat) {
            try {
              cat = await createCategoryUC(categoryRepo, tag.name, true, deskclockWorkspaceId);
            } catch {
              cat = await categoryRepo.findByName(tag.name, deskclockWorkspaceId);
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
      await notifyCategoriesChanged();
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
    <SubSection
      icon={<ListChecks size={14} />}
      title="Mapeamentos"
      onOpen={() => {
        if (clockifyProjects.length === 0) fetchProjects();
        if (clockifyTags.length === 0) fetchTags();
      }}
    >
      {/* O `pb-2` recompõe o respiro que este bloco tinha antes de passar ao
          `SubSection`, cujo corpo é mais justo. */}
      <div className="pb-2 space-y-5">
        {/* Projetos */}
        <MappingBox
          title="Projetos"
          count={projectMapping.length}
          total={projects.length}
          open={projectsOpen}
          onToggle={() => setProjectsOpen((v) => !v)}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-fg-muted">
              Importar cria projetos no DeskClock e os vincula automaticamente.
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <IconButton
                icon={<RefreshCw size={14} className={loadingProjects ? "animate-spin" : ""} />}
                title="Atualizar lista"
                variant="neutral"
                size="sm"
                onClick={() => fetchProjects()}
                disabled={loadingProjects}
              />
              <Button onClick={handleImportProjects} loading={importingProjects}>
                Importar do Clockify
              </Button>
            </div>
          </div>
          {projects.length === 0 ? (
            <p className="text-xs text-fg-muted italic">Nenhum projeto no DeskClock.</p>
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
        </MappingBox>

        {/* Categorias → Tags. `overflow-visible` porque o dropdown do
            `TagMultiSelect` escapa da caixa. */}
        <MappingBox
          title="Categorias para tags"
          count={categoryMapping.length}
          total={categories.length}
          open={categoriesOpen}
          onToggle={() => setCategoriesOpen((v) => !v)}
          className="overflow-visible"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-fg-muted">
              Importar cria categorias no DeskClock para cada tag e as vincula automaticamente.
            </p>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <IconButton
                icon={<RefreshCw size={14} className={loadingTags ? "animate-spin" : ""} />}
                title="Atualizar lista"
                variant="neutral"
                size="sm"
                onClick={() => fetchTags()}
                disabled={loadingTags}
              />
              <Button onClick={handleImportTags} loading={importingTags}>
                Importar do Clockify
              </Button>
            </div>
          </div>
          {categories.length === 0 ? (
            <p className="text-xs text-fg-muted italic">Nenhuma categoria no DeskClock.</p>
          ) : (
            <div className="space-y-1.5">
              {categories.map((c) => {
                const mapped = categoryMapping.find((m) => m.deskclockCategoryId === c.id);
                return (
                  <div key={c.id} className="flex items-center gap-3 py-1">
                    <span className="text-xs text-fg-secondary flex-1 truncate">{c.name}</span>
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
        </MappingBox>

        {/* Tags padrão */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-fg-secondary">Tags padrão</span>
          </div>
          <p className="text-xs text-fg-muted mb-2">
            Adicionadas em todos os envios, independente da categoria.
          </p>
          <TagMultiSelect
            allTags={clockifyTags}
            selectedIds={defaultTagIds}
            onChange={updateDefaultTags}
          />
        </div>
      </div>
    </SubSection>
  );
}
