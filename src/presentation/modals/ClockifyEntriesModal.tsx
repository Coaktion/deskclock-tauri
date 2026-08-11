import { useMemo, useState } from "react";
import { RefreshCw, Loader2, Pencil, Trash2, Plus } from "lucide-react";
import type {
  ClockifyHydratedProject,
  ClockifyHydratedTag,
  ClockifyTimeEntryFull,
  ClockifyTimeEntryPayload,
} from "@shared/types/clockify";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useClockifyEntries, projectDisplayName } from "@presentation/hooks/useClockifyEntries";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { TagMultiSelect } from "@presentation/components/TagMultiSelect";
import {
  Badge,
  BillableChip,
  Button,
  FilterPill,
  IconButton,
  Modal,
} from "@presentation/components/ui";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import {
  todayISO,
  addDaysISO,
  startOfMonthISO,
  formatHistoryDayHeader,
  formatHHMM,
  formatDurationCompact,
} from "@shared/utils/time";

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
    (new Date(entry.timeInterval.end).getTime() - new Date(entry.timeInterval.start).getTime()) /
      1000
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
        (a, b) =>
          new Date(b.timeInterval.start).getTime() - new Date(a.timeInterval.start).getTime()
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
  const [onlyDefaultTags, setOnlyDefaultTags] = useState(defaultTagIds.length > 0);

  // Range derivado do filtro
  const range = useMemo(() => {
    const today = todayISO();
    switch (quick) {
      case "today":
        return { start: today, end: today };
      case "7days":
        return { start: addDaysISO(today, -6), end: today };
      case "30days":
        return { start: addDaysISO(today, -29), end: today };
      case "month":
        return { start: startOfMonthISO(), end: today };
      case "custom":
        return { start: customStart, end: customEnd };
    }
  }, [quick, customStart, customEnd]);

  const rangeValid = !!range.start && !!range.end && range.start <= range.end;

  const {
    entries,
    loading,
    clockifyProjects,
    clockifyTags,
    editingId,
    setEditingId,
    createOpen,
    setCreateOpen,
    refresh,
    handleSaveEdit,
    handleCreate,
    handleDelete,
  } = useClockifyEntries({ apiKey, workspaceId, userId, range, rangeValid });

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
      <Modal
        title="Apontamentos do Clockify"
        onClose={onClose}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        }
      >
        <p className="text-sm text-fg">
          Configure o Clockify (API Key + workspace) na tela de Integrações antes de abrir esta
          janela.
        </p>
      </Modal>
    );
  }

  return (
    // `xl` (900) e `tall`: era janela cheia (`100vw-16px`), a quinta largura de
    // modal do app e o segundo dos dois véus com desfoque. Numa janela de 1100 px
    // sobram 900 para a tabela — é diálogo, e passa a ler como os outros.
    <Modal
      title="Apontamentos do Clockify"
      description={workspaceName ? `Workspace: ${workspaceName}` : "Workspace ativo"}
      size="xl"
      tall
      onClose={onClose}
      // Sem padding: cada linha desenha o próprio `px-5` e o cabeçalho do dia é
      // `sticky` — com padding no scrollport ele grudaria deslocado.
      bodyClassName=""
      headerEnd={
        <IconButton
          icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
          title="Recarregar"
          variant="neutral"
          size="sm"
          disabled={loading}
          onClick={refresh}
        />
      }
      toolbar={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(QUICK_LABELS) as QuickFilter[]).map((q) => (
              <FilterPill key={q} size="sm" active={quick === q} onClick={() => setQuick(q)}>
                {QUICK_LABELS[q]}
              </FilterPill>
            ))}
          </div>

          {quick === "custom" && (
            <div className="flex items-center gap-2">
              <DatePickerInput value={customStart} onChange={setCustomStart} />
              <span className="text-sm text-fg-muted">até</span>
              <DatePickerInput value={customEnd} onChange={setCustomEnd} />
            </div>
          )}

          <div className="ml-auto flex items-center gap-3">
            {defaultTagIds.length > 0 && (
              <label className="flex items-center gap-1.5 text-sm text-fg-secondary cursor-pointer">
                {/* Caixa não é `Input`: a assinatura a recusa por tipo, e ela não
                    tem casca, fundo nem raio para vestir (§8.4). */}
                <input
                  type="checkbox"
                  checked={onlyDefaultTags}
                  onChange={(e) => setOnlyDefaultTags(e.target.checked)}
                  className="accent-accent"
                />
                Apenas com tags padrão
              </label>
            )}
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setCreateOpen((v) => !v)}
              disabled={createOpen}
            >
              Novo apontamento
            </Button>
          </div>
        </div>
      }
    >
      <>
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
          <p className="text-center text-fg-muted text-sm py-12">Selecione um período válido.</p>
        )}

        {rangeValid && showLoading && (
          <div className="flex items-center justify-center py-12 text-fg-muted">
            <Loader2 size={20} className="animate-spin" />
          </div>
        )}

        {rangeValid && showEmpty && (
          <p className="text-center text-fg-muted text-sm py-12">
            Nenhum apontamento encontrado neste período.
          </p>
        )}

        {rangeValid && filteredOutByTags && (
          <div className="text-center py-12">
            <p className="text-sm text-fg-muted mb-2">
              Nenhum apontamento com as tags padrão neste período.
            </p>
            <Button variant="ghost" onClick={() => setOnlyDefaultTags(false)}>
              Mostrar todos
            </Button>
          </div>
        )}

        {rangeValid && dayGroups.length > 0 && (
          <div>
            {dayGroups.map((group) => (
              <div key={group.dateISO}>
                <div className="flex items-center justify-between px-5 py-2.5 bg-surface/60 border-b border-border-subtle sticky top-0 z-10">
                  <span className="text-overline uppercase text-fg-secondary">
                    {formatHistoryDayHeader(group.dateISO)}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-fg-muted">
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
                    onDelete={() => handleDelete(entry.id)}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </>
    </Modal>
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
  onDelete: () => Promise<void>;
}

function EntryRow(props: EntryRowProps) {
  if (props.isEditing) return <EntryEditForm {...props} />;
  return <EntryDisplay {...props} />;
}

function EntryDisplay({ entry, onStartEdit, onDelete }: EntryRowProps) {
  const startStr = formatTimeLocal(entry.timeInterval.start);
  const endStr = entry.timeInterval.end ? formatTimeLocal(entry.timeInterval.end) : "—";
  const duration = entryDurationSeconds(entry);
  const projectLabel = entry.project ? projectDisplayName(entry.project) : null;
  // A cor vem do Clockify, então é hex de terceiro; o que falta é que precisa
  // ser nosso, ou o ponto do projeto sem cor fica cinza fixo no modo claro.
  const projectColor = entry.project?.color ?? "var(--color-project-none)";

  return (
    <div className="grid grid-cols-[110px_1fr_auto_auto] items-center gap-3 px-5 py-3 border-b border-border-subtle hover:bg-raised/40 transition-colors group">
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            entry.billable ? "bg-billable" : "bg-border"
          }`}
        />
        <span className="text-xs font-mono text-fg-secondary tabular-nums">
          {startStr}–{endStr}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-fg truncate">
          {entry.description?.trim() ? (
            entry.description
          ) : (
            <span className="italic text-fg-muted">(sem descrição)</span>
          )}
        </p>
        {(projectLabel || (entry.tags && entry.tags.length > 0)) && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {projectLabel && (
              <span className="inline-flex items-center gap-1 text-xs text-fg-secondary">
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: projectColor }}
                />
                {projectLabel}
              </span>
            )}
            {entry.tags?.map((t) => (
              <Badge key={t.id}>{t.name}</Badge>
            ))}
          </div>
        )}
      </div>

      <span className="text-sm font-mono tabular-nums text-fg-secondary shrink-0">
        {formatDurationCompact(duration)}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onStartEdit}
          className="p-1.5 text-fg-secondary hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => void onDelete()}
          className="p-1.5 text-fg-secondary hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
          title="Excluir"
        >
          <Trash2 size={14} />
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

  // Resolve project ID from current input state (same logic as handleSave)
  const resolvedProjectId = useMemo<string | null>(() => {
    if (!projectInput.trim()) return null;
    const match = projectOptions.find((o) => o.name === projectInput);
    return match?.id ?? selectedProjectId;
  }, [projectInput, projectOptions, selectedProjectId]);

  const canSave = description.trim() !== "" && resolvedProjectId !== null;

  async function handleSave() {
    if (saving || !canSave) return;

    const projectId = resolvedProjectId;

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

  // O submit deste bloco é salvar o próprio apontamento — não a lista em volta.
  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving || !canSave });

  return (
    <div
      onKeyDown={handleKeyDown}
      className="px-5 py-3 border-b border-border-subtle bg-raised/30 space-y-2"
    >
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição *"
        autoFocus
        autoComplete="off"
        className="w-full px-2.5 py-1.5 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent"
      />

      <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
        <Autocomplete
          value={projectInput}
          onChange={setProjectInput}
          onSelect={(o) => {
            setProjectInput(o.name);
            setSelectedProjectId(o.id);
          }}
          options={projectOptions}
          placeholder="Projeto *"
        />
        <TagMultiSelect allTags={clockifyTags} selectedIds={tagIds} onChange={setTagIds} />
        <BillableChip billable={billable} onToggle={() => setBillable((b) => !b)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <DatePickerInput value={dateISO} onChange={setDateISO} />
        <span className="text-sm text-fg-muted">Início</span>
        <input
          type="time"
          value={startHHMM}
          onChange={(e) => setStartHHMM(e.target.value)}
          className="w-24 px-2 py-1 text-sm bg-raised border border-border rounded-control text-fg focus:outline-none focus:border-accent"
          autoComplete="off"
        />
        <span className="text-sm text-fg-muted">Fim</span>
        <input
          type="time"
          value={endHHMM}
          onChange={(e) => setEndHHMM(e.target.value)}
          className="w-24 px-2 py-1 text-sm bg-raised border border-border rounded-control text-fg focus:outline-none focus:border-accent"
          autoComplete="off"
        />
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-sm text-fg-secondary hover:text-fg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-3 py-1.5 text-sm bg-accent hover:opacity-90 text-white rounded-control disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
