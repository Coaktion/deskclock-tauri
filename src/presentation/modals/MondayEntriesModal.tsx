import { useMemo, useState } from "react";
import { DollarSign, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  useMondayEntries,
  type MondayEntry,
  type MondayEntryPatch,
} from "@presentation/hooks/useMondayEntries";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import {
  addDaysISO,
  formatDurationCompact,
  formatHistoryDayHeader,
  startOfMonthISO,
  todayISO,
} from "@shared/utils/time";

/**
 * Só janelas prontas. O personalizado saiu: a busca não é filtrada por data no
 * Monday (§ `useMondayEntries`), então ele não abria nada que as quatro janelas
 * já não cubram — em troca de dois campos de data e de um estado inválido para
 * a tela tratar.
 */
type QuickFilter = "today" | "7days" | "30days" | "month";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
};

function periodLabel(entry: MondayEntry): string {
  if (!entry.period) return "sem data";
  const fmt = (dayISO: string) => {
    const [, m, d] = dayISO.split("-");
    return `${d}/${m}`;
  };
  const { startDayISO, endDayISO } = entry.period;
  return startDayISO === endDayISO ? fmt(startDayISO) : `${fmt(startDayISO)} – ${fmt(endDayISO)}`;
}

interface DayGroup {
  dayISO: string;
  entries: MondayEntry[];
  totalHours: number;
}

/** Agrupa pelo dia de início; um item que cruza dias aparece uma vez, no começo. */
function groupByDay(entries: MondayEntry[]): DayGroup[] {
  const map = new Map<string, MondayEntry[]>();
  for (const entry of entries) {
    const day = entry.period?.startDayISO ?? "";
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayISO, list]) => ({
      dayISO,
      entries: list,
      totalHours: list.reduce((sum, e) => sum + e.hoursDecimal, 0),
    }));
}

export function MondayEntriesModal({ onClose }: { onClose: () => void }) {
  const config = useAppConfig();
  const apiKey = config.get("mondayApiKey");
  const userId = config.get("mondayUserId");
  const mondayWorkspaceId = config.get("mondayActiveWorkspaceId");

  const [quick, setQuick] = useState<QuickFilter>("7days");

  useEscapeToClose(onClose);

  const mappings = useMemo(
    () =>
      normalizeProjectMappings(config.get("mondayProjectMapping")).filter(
        (m) => m.workspaceId === mondayWorkspaceId
      ),
    // Relê só quando a config carrega ou o workspace do Monday muda — `config`
    // é recriado a cada render do provider.
    [config.isLoaded, mondayWorkspaceId] // eslint-disable-line react-hooks/exhaustive-deps
  );

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
    }
  }, [quick]);

  const { entries, loading, editingId, setEditingId, refresh, handleSaveEdit, handleDelete } =
    useMondayEntries({ mappings, userId, range });

  const dayGroups = useMemo(() => groupByDay(entries), [entries]);
  const totalHours = entries.reduce((sum, e) => sum + e.hoursDecimal, 0);

  if (!apiKey || !mondayWorkspaceId || !userId) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-6">
          <p className="text-sm text-gray-200 mb-4">
            Conecte o Monday e escolha um workspace na tela de Integrações antes de abrir esta
            janela.
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">Atividades no Monday</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              Somente as suas, nos {mappings.length} board(s) vinculados
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {entries.length > 0 && (
              <span className="text-xs font-mono tabular-nums text-gray-400">
                {formatDurationCompact(Math.round(totalHours * 3600))}
              </span>
            )}
            <button
              onClick={refresh}
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

        <div className="px-5 py-3 border-b border-gray-800 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Travados enquanto a busca corre: sem isso dá para pular de janela
                em janela e cada clique reordena a lista sob o cursor. */}
            {(Object.keys(QUICK_LABELS) as QuickFilter[]).map((q) => (
              <button
                key={q}
                onClick={() => setQuick(q)}
                disabled={loading}
                className={`px-3 py-1 text-xs rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  quick === q
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {QUICK_LABELS[q]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {mappings.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-12">
              Nenhum board vinculado. Importe os projetos na tela de Integrações primeiro.
            </p>
          )}

          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {!loading && mappings.length > 0 && dayGroups.length === 0 && (
            <p className="text-center text-gray-500 text-sm py-12">
              Nenhuma atividade sua neste período.
            </p>
          )}

          {dayGroups.map((group) => (
            <div key={group.dayISO}>
              <div className="flex items-center justify-between px-5 py-2.5 bg-gray-900/60 border-b border-gray-800 sticky top-0 z-10">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
                  {group.dayISO ? formatHistoryDayHeader(group.dayISO) : "Sem data"}
                </span>
                <span className="text-xs font-mono tabular-nums text-gray-500">
                  {formatDurationCompact(Math.round(group.totalHours * 3600))}
                </span>
              </div>
              {group.entries.map((entry) =>
                editingId === entry.itemId ? (
                  <EntryForm
                    key={entry.itemId}
                    entry={entry}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => handleSaveEdit(entry, patch)}
                  />
                ) : (
                  <EntryRow
                    key={entry.itemId}
                    entry={entry}
                    onStartEdit={() => setEditingId(entry.itemId)}
                    onDelete={() => handleDelete(entry)}
                  />
                )
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface EntryRowProps {
  entry: MondayEntry;
  onStartEdit: () => void;
  onDelete: () => Promise<void>;
}

function EntryRow({ entry, onStartEdit, onDelete }: EntryRowProps) {
  return (
    <div className="grid grid-cols-[110px_1fr_auto_auto] items-center gap-3 px-5 py-3 border-b border-gray-800 hover:bg-gray-800/40 transition-colors group">
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            entry.billable ? "bg-emerald-500" : "bg-gray-600"
          }`}
        />
        <span className="text-xs font-mono text-gray-400 tabular-nums">{periodLabel(entry)}</span>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-gray-100 truncate">{entry.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-[11px] text-gray-500 truncate">{entry.boardName}</span>
          {[entry.activityTypeLabel, entry.projectStageLabel]
            .filter((label) => label.length > 0)
            .map((label) => (
              <span
                key={label}
                className="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded text-[10px]"
              >
                {label}
              </span>
            ))}
        </div>
      </div>

      <span className="text-sm font-mono tabular-nums text-gray-300 shrink-0">
        {formatDurationCompact(Math.round(entry.hoursDecimal * 3600))}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onStartEdit}
          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-blue-900/20 rounded-lg transition-colors"
          title="Editar no Monday"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={() => void onDelete()}
          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors"
          title="Excluir do Monday"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

interface EntryFormProps {
  entry: MondayEntry;
  onCancel: () => void;
  onSave: (patch: MondayEntryPatch) => Promise<void>;
}

function EntryForm({ entry, onCancel, onSave }: EntryFormProps) {
  const [name, setName] = useState(entry.name);
  const [hours, setHours] = useState(String(entry.hoursDecimal));
  const [billable, setBillable] = useState(entry.billable);
  const [activityType, setActivityType] = useState(entry.activityTypeLabel);
  const [projectStage, setProjectStage] = useState(entry.projectStageLabel);
  const [saving, setSaving] = useState(false);

  const hoursDecimal = Number(hours.replace(",", "."));
  const canSave = name.trim() !== "" && Number.isFinite(hoursDecimal) && hoursDecimal >= 0;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      await onSave({
        name,
        hoursDecimal,
        billable,
        activityTypeLabel: activityType,
        projectStageLabel: projectStage,
      });
    } finally {
      setSaving(false);
    }
  }

  const selectClass =
    "px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500";

  return (
    <div className="px-5 py-3 border-b border-gray-800 bg-gray-800/30 space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da atividade"
        autoFocus
        className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-gray-500">Horas</label>
        <input
          type="text"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20 px-2 py-1.5 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-100 tabular-nums focus:outline-none focus:border-blue-500"
        />

        <select
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
          className={selectClass}
        >
          <option value="">Activity Type…</option>
          {entry.mapping.activityTypeLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </select>

        {entry.mapping.projectStageLabels.length > 0 && (
          <select
            value={projectStage}
            onChange={(e) => setProjectStage(e.target.value)}
            className={selectClass}
          >
            <option value="">Project Stage…</option>
            {entry.mapping.projectStageLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        )}

        <button
          type="button"
          onClick={() => setBillable((b) => !b)}
          title={
            billable ? "Faturável — clique para alternar" : "Não-faturável — clique para alternar"
          }
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors shrink-0 ${
            billable
              ? "bg-green-900/40 border-green-700 text-green-400"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
          }`}
        >
          <DollarSign size={13} />
          {billable ? "Faturável" : "Não-faturável"}
        </button>

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
            disabled={saving || !canSave}
            className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving && <Loader2 size={11} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-600">
        As datas vêm do envio e não são editáveis aqui — quem manda nas horas é o DeskClock.
      </p>
    </div>
  );
}
