import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { ClockifyConnectModal } from "@presentation/modals/ClockifyConnectModal";
import { ClockifyEntriesModal } from "@presentation/modals/ClockifyEntriesModal";
import { ClockifySendModal } from "@presentation/modals/ClockifySendModal";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { TagMultiSelect } from "@presentation/components/TagMultiSelect";
import { showToast } from "@shared/utils/toast";
import {
  ChevronDown,
  ChevronRight,
  ListChecks,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatLastSync } from "./GoogleIntegrationSection";
import { IntegrationTile, Row, StatusBadge, SubSection, Toggle } from "./shared";

/* ── SVG Clockify ── */

export function ClockifyLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#03A9F4" />
      <path
        d="M16 7C11.029 7 7 11.029 7 16C7 20.971 11.029 25 16 25C20.971 25 25 20.971 25 16C25 11.029 20.971 7 16 7ZM16 23C12.134 23 9 19.866 9 16C9 12.134 12.134 9 16 9C19.866 9 23 12.134 23 16C23 19.866 19.866 23 16 23Z"
        fill="white"
      />
      <path d="M17 11.5H15V16.414L18.293 19.707L19.707 18.293L17 15.586V11.5Z" fill="white" />
    </svg>
  );
}

/* ── Sub-seção Workspace ── */

function ClockifyWorkspaceSection() {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [activeId, setActiveId] = useState("");
  const [activeName, setActiveName] = useState("");
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setActiveId(config.get("clockifyActiveWorkspaceId"));
    setActiveName(config.get("clockifyActiveWorkspaceName"));
    const cached = config.get("clockifyWorkspaceCache");
    if (cached.length > 0) setWorkspaces(cached);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const client = factories.createClockifyApi();
      const list = await client.listWorkspaces();
      setWorkspaces(list);
      await config.set("clockifyWorkspaceCache", list);
    } catch {
      // erro silencioso — lista anterior permanece
    } finally {
      setRefreshing(false);
    }
  }

  async function handleChange(id: string) {
    const ws = workspaces.find((w) => w.id === id);
    if (!ws) return;
    setActiveId(id);
    setActiveName(ws.name);
    await config.set("clockifyActiveWorkspaceId", id);
    await config.set("clockifyActiveWorkspaceName", ws.name);
  }

  return (
    <div className="border-t border-gray-800 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-300">Workspace ativo</span>
        <div className="flex items-center gap-2">
          {workspaces.length > 0 ? (
            <select
              value={activeId}
              onChange={(e) => handleChange(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-[200px]"
            >
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs text-gray-500">{activeName || "—"}</span>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            title="Atualizar lista"
            className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-seção Mapeamentos ── */

interface ClockifyRef {
  id: string;
  name: string;
}

function ProjectMappingRow({
  project,
  clockifyProjects,
  mapped,
  onUpdate,
}: {
  project: import("@domain/entities/Project").Project;
  clockifyProjects: ClockifyRef[];
  mapped: { clockifyProjectId: string; clockifyProjectName: string } | undefined;
  onUpdate: (deskclockProjectId: string, clockifyProjectId: string) => void;
}) {
  const [inputValue, setInputValue] = useState(mapped?.clockifyProjectName ?? "");

  useEffect(() => {
    setInputValue(mapped?.clockifyProjectName ?? "");
  }, [mapped?.clockifyProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-gray-300 flex-1 truncate min-w-0">{project.name}</span>
      <div className="flex items-center gap-1 w-[210px] shrink-0">
        <div className="flex-1">
          <Autocomplete
            value={inputValue}
            onChange={setInputValue}
            onSelect={(opt) => {
              setInputValue(opt.name);
              onUpdate(project.id, opt.id);
            }}
            options={clockifyProjects}
            placeholder="sem mapeamento"
          />
        </div>
        {mapped?.clockifyProjectId && (
          <button
            onClick={() => {
              setInputValue("");
              onUpdate(project.id, "");
            }}
            title="Remover mapeamento"
            className="text-gray-600 hover:text-gray-400 transition-colors shrink-0"
          >
            <X size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

function ClockifyMappingsSection({
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
  const [projectMapping, setProjectMapping] = useState<
    import("@shared/types/clockifyConfig").ClockifyProjectMapping[]
  >([]);
  const [categoryMapping, setCategoryMapping] = useState<
    import("@shared/types/clockifyConfig").ClockifyCategoryMapping[]
  >([]);
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
      const client = getClient();
      const list = await client.listProjects(workspaceId);
      const sortedProjects = list
        .map((p) => ({ id: p.id, name: projectDisplayName(p) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      setClockifyProjects(sortedProjects);

      const { createProject: createProjectUC } =
        await import("@domain/usecases/projects/CreateProject");

      const allPM = config.get("clockifyProjectMapping");
      const otherWS = allPM.filter((m) => m.workspaceId !== workspaceId);
      const newMappings: import("@shared/types/clockifyConfig").ClockifyProjectMapping[] = [];

      for (const cp of list) {
        let proj = await projectRepo.findByName(cp.name);
        if (!proj) {
          try {
            proj = await createProjectUC(projectRepo, cp.name);
          } catch {
            proj = await projectRepo.findByName(cp.name);
          }
        }
        if (!proj) continue;
        newMappings.push({
          deskclockProjectId: proj.id,
          clockifyProjectId: cp.id,
          clockifyProjectName: projectDisplayName(cp),
          workspaceId,
        });
      }

      const merged = [...otherWS, ...newMappings];
      await config.set("clockifyProjectMapping", merged);
      setProjectMapping(newMappings);
      await reloadProjects();
      await showToast("success", `${list.length} projeto(s) importado(s).`);
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
      const client = getClient();
      const list = await client.listTags(workspaceId);
      setClockifyTags(list.map((t) => ({ id: t.id, name: t.name })));

      const { createCategory: createCategoryUC } =
        await import("@domain/usecases/categories/CreateCategory");

      const allCM = config.get("clockifyCategoryMapping");
      const otherWS = allCM.filter((m) => m.workspaceId !== workspaceId);
      const newMappings: import("@shared/types/clockifyConfig").ClockifyCategoryMapping[] = [];

      for (const tag of list) {
        let cat = await categoryRepo.findByName(tag.name);
        if (!cat) {
          try {
            cat = await createCategoryUC(categoryRepo, tag.name, true);
          } catch {
            cat = await categoryRepo.findByName(tag.name);
          }
        }
        if (!cat) continue;
        const existingTagIds =
          allCM.find((m) => m.deskclockCategoryId === cat!.id && m.workspaceId === workspaceId)
            ?.clockifyTagIds ?? [];
        newMappings.push({
          deskclockCategoryId: cat.id,
          clockifyTagIds: existingTagIds.length > 0 ? existingTagIds : [tag.id],
          workspaceId,
        });
      }

      const merged = [...otherWS, ...newMappings];
      await config.set("clockifyCategoryMapping", merged);
      setCategoryMapping(newMappings);
      await reloadCategories();
      await showToast("success", `${list.length} tag(s) importada(s) como categorias.`);
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

/* ── Sub-seção Auto-sync Clockify ── */

function ClockifyAutoSyncSection() {
  const config = useAppConfig();
  const [autoSync, setAutoSync] = useState(false);
  const [syncMode, setSyncMode] = useState<"per-task" | "daily">("per-task");
  const [syncTrigger, setSyncTrigger] = useState<"on-open" | "fixed-time">("on-open");
  const [syncTime, setSyncTime] = useState("18:00");
  const [lastSyncTs, setLastSyncTs] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setAutoSync(config.get("clockifyAutoSync"));
    setSyncMode(config.get("clockifyAutoSyncMode"));
    setSyncTrigger(config.get("clockifyAutoSyncTrigger"));
    setSyncTime(config.get("clockifyAutoSyncTime"));
    setLastSyncTs(config.get("clockifyDailySyncLastTimestamp"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubSection
      icon={<RefreshCw size={15} />}
      title="Sincronização automática"
      badge={
        autoSync ? (
          <span className="ml-1 text-[10.5px] text-blue-400 font-medium">Ativa</span>
        ) : undefined
      }
    >
      <Row label="Ativar">
        <Toggle
          checked={autoSync}
          onChange={async (v) => {
            setAutoSync(v);
            await config.set("clockifyAutoSync", v);
          }}
        />
      </Row>

      {autoSync && (
        <div className="pl-4 border-l border-gray-800 ml-1 mb-1">
          <div className="py-2.5 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">Modo</span>
              <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                {(["per-task", "daily"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={async () => {
                      setSyncMode(m);
                      await config.set("clockifyAutoSyncMode", m);
                    }}
                    className={`px-2.5 py-1 text-xs rounded transition-colors ${
                      syncMode === m
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {m === "per-task" ? "Por tarefa" : "Diário"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              {syncMode === "per-task"
                ? "Envia cada tarefa automaticamente ao ser concluída."
                : "Agrupa e envia de uma vez, cobrindo fins de semana e dias perdidos."}
            </p>
          </div>

          {syncMode === "daily" && (
            <>
              <div className="py-2.5 border-b border-gray-800">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">Gatilho</span>
                  <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                    {(["on-open", "fixed-time"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={async () => {
                          setSyncTrigger(t);
                          await config.set("clockifyAutoSyncTrigger", t);
                        }}
                        className={`px-2.5 py-1 text-xs rounded transition-colors ${
                          syncTrigger === t
                            ? "bg-blue-600 text-white"
                            : "text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {t === "on-open" ? "Ao abrir o app" : "Horário fixo"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {syncTrigger === "fixed-time" && (
                <Row label="Horário">
                  <input
                    type="time"
                    value={syncTime}
                    onChange={(e) => setSyncTime(e.target.value)}
                    onBlur={() => config.set("clockifyAutoSyncTime", syncTime)}
                    className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                  />
                </Row>
              )}

              <div className="py-2.5 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 shrink-0">
                  Último envio:{" "}
                  <span className="text-gray-300">
                    {lastSyncTs ? formatLastSync(lastSyncTs) : "Nunca"}
                  </span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </SubSection>
  );
}

interface ClockifyConnectedSectionsProps {
  projects: import("@domain/entities/Project").Project[];
  categories: import("@domain/entities/Category").Category[];
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
  onShowEntriesModal: () => void;
}

function ClockifyConnectedSections({
  projects,
  categories,
  reloadProjects,
  reloadCategories,
  onShowSendModal,
  onShowEntriesModal,
}: ClockifyConnectedSectionsProps) {
  return (
    <>
      <ClockifyWorkspaceSection />
      <ClockifyMappingsSection
        projects={projects}
        categories={categories}
        reloadProjects={reloadProjects}
        reloadCategories={reloadCategories}
      />
      <ClockifyAutoSyncSection />
      <div className="border-t border-gray-800 px-4 py-3 flex items-center gap-2">
        <button
          onClick={onShowEntriesModal}
          className="flex-1 flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700"
        >
          <ListChecks size={12} />
          Gerenciar apontamentos…
        </button>
        <button
          onClick={onShowSendModal}
          className="flex-1 flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors justify-center border border-gray-700"
        >
          <Send size={12} />
          Enviar tarefas manualmente…
        </button>
      </div>
    </>
  );
}

/* ── Card Clockify ── */

export function ClockifyIntegrationCard() {
  const config = useAppConfig();
  const { projects, reload: reloadProjects } = useProjects();
  const { categories, reload: reloadCategories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showEntriesModal, setShowEntriesModal] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("clockifyApiKey"));
    setEmail(config.get("clockifyUserEmail"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConnected() {
    setConnected(true);
    setEmail(config.get("clockifyUserEmail"));
    setShowConnectModal(false);
  }

  async function handleDisconnect() {
    setLoading(true);
    await config.set("clockifyApiKey", "");
    await config.set("clockifyUserEmail", "");
    await config.set("clockifyUserId", "");
    await config.set("clockifyActiveWorkspaceId", "");
    await config.set("clockifyActiveWorkspaceName", "");
    await config.set("clockifyWorkspaceCache", []);
    setConnected(false);
    setEmail("");
    setLoading(false);
  }

  return (
    <>
      <div className="rounded-xl border border-gray-800 bg-gray-900/50">
        <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-800 rounded-t-xl overflow-hidden">
          <div className="mt-0.5 shrink-0">
            <ClockifyLogo size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-100">Clockify</h2>
              <StatusBadge connected={connected} email={email} />
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Registre entradas de tempo diretamente no Clockify.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-2">
            {connected ? (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-3 py-1.5 rounded transition-colors"
              >
                {loading ? <Loader2 size={12} className="animate-spin" /> : <LogOut size={12} />}
                Desconectar
              </button>
            ) : (
              <button
                onClick={() => setShowConnectModal(true)}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded transition-colors"
              >
                <LogIn size={12} />
                Conectar
              </button>
            )}
          </div>
        </div>

        {connected && (
          <ClockifyConnectedSections
            projects={projects}
            categories={categories}
            reloadProjects={reloadProjects}
            reloadCategories={reloadCategories}
            onShowSendModal={() => setShowSendModal(true)}
            onShowEntriesModal={() => setShowEntriesModal(true)}
          />
        )}
      </div>

      {showConnectModal && (
        <ClockifyConnectModal
          onConnected={handleConnected}
          onClose={() => setShowConnectModal(false)}
        />
      )}

      {showSendModal && (
        <ClockifySendModal
          projects={projects}
          categories={categories}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {showEntriesModal && <ClockifyEntriesModal onClose={() => setShowEntriesModal(false)} />}
    </>
  );
}

export function ClockifyTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("clockifyApiKey");
  const email = config.isLoaded ? config.get("clockifyUserEmail") : "";
  const workspaceName = config.isLoaded ? config.get("clockifyActiveWorkspaceName") : "";

  return (
    <IntegrationTile
      onClick={onClick}
      logo={<ClockifyLogo size={20} />}
      name="Clockify"
      description="Registre entradas de tempo no Clockify"
      connected={connected}
      email={email}
      subBadges={connected && workspaceName ? [{ label: workspaceName, active: true }] : undefined}
    />
  );
}
