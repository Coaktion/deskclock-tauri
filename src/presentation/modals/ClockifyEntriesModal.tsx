import { useEffect, useMemo, useState } from "react";
import { X, RefreshCw, Loader2, Pencil, DollarSign, Plus } from "lucide-react";
import { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import type {
  ClockifyHydratedProject,
  ClockifyHydratedTag,
  ClockifyTimeEntryFull,
  ClockifyTimeEntryPayload,
} from "@infra/integrations/clockify/types";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { TagMultiSelect } from "@presentation/components/TagMultiSelect";
import {
  todayISO,
  addDaysISO,
  startOfDayISO,
  endOfDayISO,
  startOfMonthISO,
  formatHistoryDayHeader,
  formatHHMM,
  formatDurationCompact,
} from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";

type QuickFilter = "today" | "7days" | "30days" | "month" | "custom";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
  custom: "Personalizado",
};

interface ClockifyEntriesModalProps {
  onClose: () => void;
}

function projectDisplayName(p: { name: string; clientName?: string | null }): string {
  return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
}

function toLocalDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatTimeLocal(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function entryDurationSeconds(entry: ClockifyTimeEntryFull): number {
  if (!entry.timeInterval.end) return 0;
  return Math.round(
    (new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime()) / 1000
  );
}

interface DayGroup {
  dateISO: string;
  entries: ClockifyTimeEntryFull[];
  totalSeconds: number;
}

function groupByDay(entries: ClockifyTimeEntryFull[]): DayGroup[] {
  const map = new Map<string, ClockifyTimeEntryFull[]>();
  for (const e of entries) {
    const date = toLocalDate(e.timeInterval.start);
    const list = map.get(date) ?? [];
    list.push(e);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateISO, list]) => ({
      dateISO,
      entries: list.sort(
        (a, b) => new Date(b.timeInterval.start).getTime() - new Date(a.timeInterval.start).getTime()
      ),
      totalSeconds: list.reduce((s, e) => s + entryDurationSeconds(e), 0),
    }));
}

export function ClockifyEntriesModal({ onClose }: ClockifyEntriesModalProps) {
  const config = useAppConfig();
  const apiKey = config.get("clockifyApiKey");
  const userId = config.get("clockifyUserId");
  const workspaceId = config.get("clockifyActiveWorkspaceId");
  const workspaceName = config.get("clockifyActiveWorkspaceName");
  const defaultTagIds = config.get("clockifyDefaultTagIds");

  const [quick, setQuick] = useState<QuickFilter>("today");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());
  const [entries, setEntries] = useState<ClockifyTimeEntryFull[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const [onlyDefaultTags, setOnlyDefaultTags] = useState(defaultTagIds.length > 0);

  const [clockifyProjects, setClockifyProjects] = useState<ClockifyHydratedProject[]>([]);
  const [clockifyTags, setClockifyTags] = useState<ClockifyHydratedTag[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // ESC fecha
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Range derivado do filtro
  const range = useMemo(() => {
    const today = todayISO();
    switch (quick) {
      case "today":  return { start: today, end: today };
      case "7days":  return { start: addDaysISO(today, -6), end: today };
      case "30days": return { start: addDaysISO(today, -29), end: today };
      case "month":  return { start: startOfMonthISO(), end: today };
      case "custom": return { start: customStart, end: customEnd };
    }
  }, [quick, customStart, customEnd]);

  const rangeValid = !!range.start && !!range.end && range.start <= range.end;

  // Fetch de entries quando o range muda
  useEffect(() => {
    if (!apiKey || !workspaceId || !userId || !rangeValid) return;
    const client = new ClockifyClient(apiKey);
    setLoading(true);
    client
      .listTimeEntries(workspaceId, userId, startOfDayISO(range.start), endOfDayISO(range.end))
      .then(setEntries)
      .catch((err) => {
        showToast("error", err instanceof Error ? err.message : "Erro ao carregar apontamentos.");
      })
      .finally(() => setLoading(false));
  }, [apiKey, workspaceId, userId, range.start, range.end, rangeValid, refreshSignal]);

  // Cache de projetos/tags Clockify para os formulários (1x ao abrir, refetch ao trocar workspace)
  useEffect(() => {
    if (!apiKey || !workspaceId) return;
    const client = new ClockifyClient(apiKey);
    Promise.all([client.listProjects(workspaceId), client.listTags(workspaceId)])
      .then(([ps, ts]) => {
        setClockifyProjects(
          [...ps].sort((a, b) =>
            projectDisplayName(a).localeCompare(projectDisplayName(b), "pt-BR", { sensitivity: "base" })
          )
        );
        setClockifyTags(
          [...ts].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }))
        );
      })
      .catch((err) => {
        showToast("error", err instanceof Error ? err.message : "Erro ao carregar projetos/tags.");
      });
  }, [apiKey, workspaceId]);

  async function handleSaveEdit(entryId: string, payload: ClockifyTimeEntryPayload) {
    const client = new ClockifyClient(apiKey);
    try {
      await client.updateTimeEntry(workspaceId, entryId, payload);
      await showToast("success", "Apontamento atualizado.");
      setEditingId(null);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao salvar.");
    }
  }

  async function handleCreate(payload: ClockifyTimeEntryPayload) {
    const client = new ClockifyClient(apiKey);
    try {
      await client.createTimeEntry(workspaceId, payload);
      await showToast("success", "Apontamento criado.");
      setCreateOpen(false);
      setRefreshSignal((n) => n + 1);
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao criar.");
    }
  }

  // Defaults para o form de criação: agora arredondado pra baixo, +1h pro fim,
  // tags padrão pré-selecionadas (mesmas usadas no envio automático)
  const createInitial = useMemo<EntryFormInitial>(() => {
    const now = new Date();
    const startHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const endDate = new Date(now.getTime() + 60 * 60 * 1000);
    const endHHMM = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
    return {
      description: "",
      projectId: null,
      projectName: "",
      tagIds: defaultTagIds,
      billable: false,
      dateISO: todayISO(),
      startHHMM,
      endHHMM,
    };
  }, [defaultTagIds, createOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pipeline de filtragem: oculta in-progress e (opcional) filtra por tags padrão
  const visibleEntries = useMemo(() => {
    let list = entries.filter((e) => e.timeInterval.end !== null);
    if (onlyDefaultTags && defaultTagIds.length > 0) {
      list = list.filter((e) => defaultTagIds.every((id) => e.tagIds.includes(id)));
    }
    return list;
  }, [entries, onlyDefaultTags, defaultTagIds]);

  const dayGroups = useMemo(() => groupByDay(visibleEntries), [visibleEntries]);

  const filteredOutByTags =
    onlyDefaultTags &&
    defaultTagIds.length > 0 &&
    visibleEntries.length === 0 &&
    entries.some((e) => e.timeInterval.end !== null);

  const showLoading = loading && entries.length === 0;
  const showEmpty = !loading && dayGroups.length === 0 && !filteredOutByTags;

  // Guard: configuração ausente
  if (!apiKey || !workspaceId || !userId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
          <p className="text-sm text-gray-200 mb-4">
            Configure o Clockify (API Key + workspace) na tela de Integrações antes de abrir esta janela.
          </p>
          <button
            onClick={onClose}
            className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 px-3 py-1.5 rounded transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">Apontamentos do Clockify</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {workspaceName ? `Workspace: ${workspaceName}` : "Workspace ativo"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setRefreshSignal((n) => n + 1)}
              disabled={loading}
              title="Recarregar"
              className="text-gray-500 hover:text-gray-300 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={onClose}
              title="Fechar"
              className="text-gray-500 hover:text-gray-300 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickFilter[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuick(q)}
                className={`px-3 py-1 text-xs rounded-full transition-colors ${
                  quick === q
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {QUICK_LABELS[q]}
              </button>
            ))}
          </div>

          {quick === "custom" && (
            <div className="flex items-center gap-2">
              <DatePickerInput
                value={customStart}
                onChange={setCustomStart}
                className="text-xs"
              />
              <span className="text-xs text-gray-600">até</span>
              <DatePickerInput
                value={customEnd}
                onChange={setCustomEnd}
                className="text-xs"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {defaultTagIds.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyDefaultTags}
                  onChange={(e) => setOnlyDefaultTags(e.target.checked)}
                  className="accent-blue-500"
                />
                Apenas com tags padrão
              </label>
            )}
            <button
              onClick={() => setCreateOpen((v) => !v)}
              disabled={createOpen}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-full transition-colors"
            >
              <Plus size={12} />
              Novo apontamento
            </button>
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {createOpen && (
            <EntryForm
              initial={createInitial}
              clockifyProjects={clockifyProjects}
              clockifyTags={clockifyTags}
              saveLabel="Criar"
              onCancel={() => setCreateOpen(false)}
              onSave={handleCreate}
            />
          )}

          {!rangeValid && (
            <p className="text-center text-gray-500 text-sm py-12">
              Selecione um período válido.
            </p>
          )}

          {rangeValid && showLoading && (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {rangeValid && showEmpty && (
            <p className="text-center text-gray-500 text-sm py-12">
              Nenhum apontamento encontrado neste período.
            </p>
          )}

          {rangeValid && filteredOutByTags && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500 mb-2">
                Nenhum apontamento com as tags padrão neste período.
              </p>
              <button
                onClick={() => setOnlyDefaultTags(false)}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Mostrar todos
              </button>
            </div>
          )}

          {rangeValid && dayGroups.length > 0 && (
            <div>
              {dayGroups.map((group) => (
                <div key={group.dateISO}>
                  <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900/60 border-b border-gray-800 sticky top-0 z-10">
                    <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                      {formatHistoryDayHeader(group.dateISO)}
                    </span>
                    <span className="text-xs font-mono tabular-nums text-gray-500">
                      {formatHHMM(group.totalSeconds)}
                    </span>
                  </div>
                  {group.entries.map((entry) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      isEditing={editingId === entry.id}
                      clockifyProjects={clockifyProjects}
                      clockifyTags={clockifyTags}
                      onStartEdit={() => setEditingId(entry.id)}
                      onCancelEdit={() => setEditingId(null)}
                      onSave={(payload) => handleSaveEdit(entry.id, payload)}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface EntryRowProps {
  entry: ClockifyTimeEntryFull;
  isEditing: boolean;
  clockifyProjects: ClockifyHydratedProject[];
  clockifyTags: ClockifyHydratedTag[];
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: ClockifyTimeEntryPayload) => Promise<void>;
}

function EntryRow(props: EntryRowProps) {
  if (props.isEditing) return <EntryEditForm {...props} />;
  return <EntryDisplay {...props} />;
}

function EntryDisplay({ entry, onStartEdit }: EntryRowProps) {
  const startStr = formatTimeLocal(entry.timeInterval.start);
  const endStr = entry.timeInterval.end ? formatTimeLocal(entry.timeInterval.end) : "—";
  const duration = entryDurationSeconds(entry);
  const projectLabel = entry.project ? projectDisplayName(entry.project) : null;
  const projectColor = entry.project?.color ?? "#6b7280";

  return (
    <div className="grid grid-cols-[110px_1fr_auto_auto] items-center gap-3 px-5 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group">
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            entry.billable ? "bg-emerald-500" : "bg-gray-600"
          }`}
        />
        <span className="text-xs font-mono text-gray-400 tabular-nums">
          {startStr}–{endStr}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-gray-100 truncate">
          {entry.description?.trim() ? (
            entry.description
          ) : (
            <span className="italic text-gray-500">(sem descrição)</span>
          )}
        </p>
        {(projectLabel || (entry.tags && entry.tags.length > 0)) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {projectLabel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-gray-400">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: projectColor }}
                />
                {projectLabel}
              </span>
            )}
            {entry.tags?.map((t) => (
              <span
                key={t.id}
                className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[10px]"
              >
                {t.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <span className="text-sm font-mono tabular-nums text-gray-300 shrink-0">
        {formatDurationCompact(duration)}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onStartEdit}
          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
          title="Editar"
        >
          <Pencil size={13} />
        </button>
      </div>
    </div>
  );
}

function EntryEditForm({
  entry,
  clockifyProjects,
  clockifyTags,
  onCancelEdit,
  onSave,
}: EntryRowProps) {
  return (
    <EntryForm
      initial={{
        description: entry.description ?? "",
        projectId: entry.projectId,
        projectName: entry.project ? projectDisplayName(entry.project) : "",
        tagIds: entry.tagIds,
        billable: entry.billable,
        dateISO: toLocalDate(entry.timeInterval.start),
        startHHMM: isoToHHMM(entry.timeInterval.start),
        endHHMM: entry.timeInterval.end
          ? isoToHHMM(entry.timeInterval.end)
          : isoToHHMM(entry.timeInterval.start),
      }}
      clockifyProjects={clockifyProjects}
      clockifyTags={clockifyTags}
      saveLabel="Salvar"
      onCancel={onCancelEdit}
      onSave={onSave}
    />
  );
}

interface EntryFormInitial {
  description: string;
  projectId: string | null;
  projectName: string;
  tagIds: string[];
  billable: boolean;
  dateISO: string;
  startHHMM: string;
  endHHMM: string;
}

interface EntryFormProps {
  initial: EntryFormInitial;
  clockifyProjects: ClockifyHydratedProject[];
  clockifyTags: ClockifyHydratedTag[];
  saveLabel: string;
  onCancel: () => void;
  onSave: (payload: ClockifyTimeEntryPayload) => Promise<void>;
}

function EntryForm({
  initial,
  clockifyProjects,
  clockifyTags,
  saveLabel,
  onCancel,
  onSave,
}: EntryFormProps) {
  const [description, setDescription] = useState(initial.description);
  const [projectInput, setProjectInput] = useState(initial.projectName);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initial.projectId);
  const [tagIds, setTagIds] = useState<string[]>(initial.tagIds);
  const [billable, setBillable] = useState(initial.billable);
  const [dateISO, setDateISO] = useState(initial.dateISO);
  const [startHHMM, setStartHHMM] = useState(initial.startHHMM);
  const [endHHMM, setEndHHMM] = useState(initial.endHHMM);
  const [saving, setSaving] = useState(false);

  const projectOptions = useMemo(
    () => clockifyProjects.map((p) => ({ id: p.id, name: projectDisplayName(p) })),
    [clockifyProjects]
  );

  async function handleSave() {
    if (saving) return;

    // Resolver projectId: input vazio → null; match exato pelo display name → id; senão mantém o último selecionado
    let projectId: string | null;
    if (!projectInput.trim()) {
      projectId = null;
    } else {
      const match = projectOptions.find((o) => o.name === projectInput);
      projectId = match?.id ?? selectedProjectId;
    }

    const startISO = buildISO(dateISO, startHHMM);
    let endISO = buildISO(dateISO, endHHMM);
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildISO(addDaysISO(dateISO, 1), endHHMM);
    }

    const payload: ClockifyTimeEntryPayload = {
      start: startISO,
      end: endISO,
      description: description.trim(),
      billable,
      ...(projectId ? { projectId } : {}),
      ...(tagIds.length > 0 ? { tagIds } : {}),
    };

    setSaving(true);
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-5 py-3 border-b border-gray-800 bg-gray-800/30 space-y-2">
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        autoFocus
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-start">
        <Autocomplete
          value={projectInput}
          onChange={setProjectInput}
          onSelect={(o) => {
            setProjectInput(o.name);
            setSelectedProjectId(o.id);
          }}
          options={projectOptions}
          placeholder="Projeto (opcional)"
        />
        <TagMultiSelect
          allTags={clockifyTags}
          selectedIds={tagIds}
          onChange={setTagIds}
        />
        <button
          type="button"
          onClick={() => setBillable((b) => !b)}
          title={billable ? "Faturável — clique para alternar" : "Não-faturável — clique para alternar"}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors shrink-0 ${
            billable
              ? "bg-green-900/40 border-green-700 text-green-400"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
          }`}
        >
          <DollarSign size={13} />
          {billable ? "Faturável" : "Não-faturável"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DatePickerInput value={dateISO} onChange={setDateISO} />
        <span className="text-xs text-gray-500">Início</span>
        <input
          type="time"
          value={startHHMM}
          onChange={(e) => setStartHHMM(e.target.value)}
          className="w-24 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
        />
        <span className="text-xs text-gray-500">Fim</span>
        <input
          type="time"
          value={endHHMM}
          onChange={(e) => setEndHHMM(e.target.value)}
          className="w-24 px-2 py-1 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
