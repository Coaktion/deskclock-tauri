import { useEffect, useMemo, useState } from "react";
import {
  TableProperties,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Circle,
  LogIn,
  LogOut,
  Loader2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  X,
  ArrowRight,
  Send,
  RefreshCw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { type Page } from "@presentation/components/Sidebar";
import { useProjects } from "@presentation/hooks/useProjects";
import { useCategories } from "@presentation/hooks/useCategories";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { SheetsSendModal } from "@presentation/modals/SheetsSendModal";
import { ImportCalendarModal } from "@presentation/modals/ImportCalendarModal";
import { startGoogleOAuth } from "@infra/integrations/google/GoogleOAuth";
import { GoogleTokenManager } from "@infra/integrations/google/GoogleTokenManager";
import { GoogleCalendarImporter } from "@infra/integrations/GoogleCalendarImporter";
import { PlannedTaskRepository } from "@infra/database/PlannedTaskRepository";
import { TaskRepository } from "@infra/database/TaskRepository";
import { TaskIntegrationLogRepository } from "@infra/database/TaskIntegrationLogRepository";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { groupTasks } from "@shared/utils/groupTasks";
import { showToast } from "@shared/utils/toast";
import { addDaysISO, todayISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import {
  DEFAULT_COLUMN_MAPPING,
  type SheetColumn,
  type SheetColumnMapping,
} from "@shared/types/sheetsConfig";

const plannedRepo = new PlannedTaskRepository();

// Escopos unificados — uma única conexão Google para todos os serviços
const ALL_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
];

/* ── helpers ── */

function StatusBadge({ connected, email }: { connected: boolean; email?: string }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <CheckCircle2 size={12} />
      {email ? `Conectado como ${email}` : "Conectado"}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      <Circle size={12} />
      Não configurado
    </span>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function Row({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

/* ── Column mapping editor ── */

interface SortableSheetColumnProps {
  col: SheetColumn;
  idx: number;
  onToggle: (idx: number) => void;
  onRename: (idx: number, label: string) => void;
}

function SortableSheetColumn({ col, idx, onToggle, onRename }: SortableSheetColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.field,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded ${col.enabled ? "bg-gray-800/50" : "bg-gray-900/30 opacity-60"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={13} />
      </button>
      <Toggle checked={col.enabled} onChange={() => onToggle(idx)} />
      <input
        type="text"
        value={col.label}
        onChange={(e) => onRename(idx, e.target.value)}
        disabled={!col.enabled}
        className="flex-1 bg-transparent border-b border-gray-700 focus:border-blue-500 text-xs text-gray-200 outline-none py-0.5 disabled:text-gray-600"
      />
      <span className="text-xs text-gray-600 w-16 shrink-0">{col.field}</span>
    </div>
  );
}

function ColumnMappingEditor({
  mapping,
  onChange,
}: {
  mapping: SheetColumnMapping;
  onChange: (m: SheetColumnMapping) => void;
}) {
  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = mapping.findIndex((c) => c.field === active.id);
      const newIdx = mapping.findIndex((c) => c.field === over.id);
      onChange(arrayMove(mapping, oldIdx, newIdx));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={mapping.map((c) => c.field)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {mapping.map((col, idx) => (
            <SortableSheetColumn
              key={col.field}
              col={col}
              idx={idx}
              onToggle={(i) =>
                onChange(mapping.map((c, j) => (j === i ? { ...c, enabled: !c.enabled } : c)))
              }
              onRename={(i, label) =>
                onChange(mapping.map((c, j) => (j === i ? { ...c, label } : c)))
              }
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ── Sub-seção Google Sheets ── */

function formatLastSync(ts: string): string {
  if (!ts) return "Nunca";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} às ${h}:${m}`;
}

function SheetsSection({
  disabled,
  projects,
  categories,
}: {
  disabled: boolean;
  projects: Project[];
  categories: Category[];
}) {
  const config = useAppConfig();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("DeskClock");
  const [columnMapping, setColumnMapping] = useState<SheetColumnMapping>(DEFAULT_COLUMN_MAPPING);
  const [durationFormat, setDurationFormat] = useState<"HH:MM" | "HH:MM:SS">("HH:MM");
  const [autoSync, setAutoSync] = useState(false);
  const [syncMode, setSyncMode] = useState<"per-task" | "daily">("per-task");
  const [syncTrigger, setSyncTrigger] = useState<"fixed-time" | "on-open">("on-open");
  const [syncTime, setSyncTime] = useState("18:00");
  const [lastSyncTs, setLastSyncTs] = useState("");
  const [colsOpen, setColsOpen] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setSpreadsheetId(config.get("integrationGoogleSheetsSpreadsheetId"));
    setSheetName(config.get("integrationGoogleSheetsSheetName") || "DeskClock");
    setColumnMapping(config.get("integrationGoogleSheetsColumnMapping") ?? DEFAULT_COLUMN_MAPPING);
    setDurationFormat(config.get("integrationGoogleSheetsDurationFormat") ?? "HH:MM");
    setAutoSync(config.get("integrationGoogleSheetsAutoSync"));
    setSyncMode(config.get("sheetsAutoSyncMode") ?? "per-task");
    setSyncTrigger(config.get("sheetsAutoSyncTrigger") ?? "on-open");
    setSyncTime(config.get("sheetsAutoSyncTime") ?? "18:00");
    setLastSyncTs(config.get("sheetsDailySyncLastTimestamp") ?? "");
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleColumnMappingChange(next: SheetColumnMapping) {
    setColumnMapping(next);
    await config.set("integrationGoogleSheetsColumnMapping", next);
  }

  async function handleDurationFormat(value: "HH:MM" | "HH:MM:SS") {
    setDurationFormat(value);
    await config.set("integrationGoogleSheetsDurationFormat", value);
  }

  async function handleSyncNow() {
    const spreadsheet = config.get("integrationGoogleSheetsSpreadsheetId");
    if (!spreadsheet) {
      await showToast("error", "Configure o ID da planilha antes de sincronizar.");
      return;
    }
    setSyncing(true);
    try {
      const lastTs = config.get("sheetsDailySyncLastTimestamp");
      const lastDateISO = lastTs
        ? new Date(lastTs).toLocaleDateString("sv-SE")
        : addDaysISO(todayISO(), -7);
      const startDateISO = addDaysISO(lastDateISO, 1);
      const endDateISO = todayISO();

      if (startDateISO > endDateISO) {
        await showToast("success", "Tudo sincronizado — nenhuma tarefa nova encontrada.");
        return;
      }

      const rangeStartISO = startOfDayISO(startDateISO);
      const rangeEndISO = endOfDayISO(endDateISO);

      const taskRepo = new TaskRepository();
      const logRepo = new TaskIntegrationLogRepository();
      const [tasks, sentIdsArr] = await Promise.all([
        taskRepo.findByDateRange(rangeStartISO, rangeEndISO),
        logRepo.findSentIds("google_sheets", rangeStartISO, rangeEndISO),
      ]);
      const completed = tasks.filter((t) => t.status === "completed");
      const sentIds = new Set(sentIdsArr);
      const groups = groupTasks(completed).filter((g) => !g.tasks.every((t) => sentIds.has(t.id)));

      const nowIso = new Date().toISOString();
      if (groups.length === 0) {
        await config.set("sheetsDailySyncLastTimestamp", nowIso);
        setLastSyncTs(nowIso);
        await showToast("success", "Tudo sincronizado — nenhuma tarefa nova encontrada.");
        return;
      }

      const tasksToSend = groups.map((g) => ({ ...g.tasks[0], durationSeconds: g.totalSeconds }));
      const allIds = groups.flatMap((g) => g.tasks.map((t) => t.id));
      const sender = new GoogleSheetsTaskSender(config, spreadsheet, projects, categories);
      await sender.send(tasksToSend);
      await logRepo.markSent(allIds, "google_sheets");
      await config.set("sheetsDailySyncLastTimestamp", nowIso);
      setLastSyncTs(nowIso);
      await showToast("success", `${groups.length} grupo(s) enviado(s) para o Sheets.`);
    } catch (err) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : "Erro ao sincronizar.";
      await showToast("error", msg);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
        <Row label="ID da planilha">
          <input
            type="text"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            onBlur={() => config.set("integrationGoogleSheetsSpreadsheetId", spreadsheetId.trim())}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="w-64 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </Row>
        <Row label="Nome da aba">
          <input
            type="text"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            onBlur={async () => {
              const name = sheetName.trim() || "DeskClock";
              setSheetName(name);
              await config.set("integrationGoogleSheetsSheetName", name);
            }}
            placeholder="DeskClock"
            className="w-40 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </Row>

        {/* Mapeamento de colunas */}
        <div className="py-2.5 border-b border-gray-800">
          <button
            onClick={() => setColsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-gray-100 w-full text-left"
          >
            {colsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            Mapeamento de colunas
            <span className="ml-auto text-xs text-gray-600">
              {columnMapping.filter((c) => c.enabled).length}/{columnMapping.length} ativas
            </span>
          </button>
          {colsOpen && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-2">
                Ative/desative colunas, edite os rótulos e reordene conforme a planilha.
              </p>
              <ColumnMappingEditor mapping={columnMapping} onChange={handleColumnMappingChange} />
            </div>
          )}
        </div>

        <Row label="Formato da duração">
          <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
            {(["HH:MM", "HH:MM:SS"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => handleDurationFormat(fmt)}
                className={`px-2.5 py-1 text-xs rounded transition-colors ${
                  durationFormat === fmt
                    ? "bg-blue-600 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                {fmt}
              </button>
            ))}
          </div>
        </Row>

        {/* Sincronização automática */}
        <Row label="Sincronização automática">
          <Toggle
            checked={autoSync}
            onChange={async (v) => {
              setAutoSync(v);
              await config.set("integrationGoogleSheetsAutoSync", v);
            }}
          />
        </Row>

        {autoSync && (
          <div className="pl-4 border-l border-gray-800 ml-1 mb-1">
            {/* Modo */}
            <div className="py-2.5 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Modo</span>
                <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                  {(["per-task", "daily"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={async () => {
                        setSyncMode(m);
                        await config.set("sheetsAutoSyncMode", m);
                      }}
                      className={`px-2.5 py-1 text-xs rounded transition-colors ${
                        syncMode === m ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {m === "per-task" ? "Por tarefa" : "Diário"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1.5">
                {syncMode === "per-task"
                  ? "Envia cada tarefa automaticamente ao ser concluída, em tempo real."
                  : "Agrupa e envia de uma vez, cobrindo fins de semana e dias perdidos."}
              </p>
            </div>

            {syncMode === "daily" && (
              <>
                {/* Gatilho */}
                <div className="py-2.5 border-b border-gray-800">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-300">Gatilho</span>
                    <div className="flex items-center gap-1 bg-gray-800 rounded p-0.5">
                      {(["on-open", "fixed-time"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={async () => {
                            setSyncTrigger(t);
                            await config.set("sheetsAutoSyncTrigger", t);
                          }}
                          className={`px-2.5 py-1 text-xs rounded transition-colors ${
                            syncTrigger === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {t === "on-open" ? "Ao abrir o app" : "Horário fixo"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    {syncTrigger === "on-open"
                      ? "Envia ao abrir o app as tarefas de ontem para trás, desde o último envio automático."
                      : "Envia no horário definido as tarefas do dia corrente e dias anteriores não sincronizados."}
                  </p>
                </div>

                {syncTrigger === "fixed-time" && (
                  <Row label="Horário">
                    <input
                      type="time"
                      value={syncTime}
                      onChange={(e) => setSyncTime(e.target.value)}
                      onBlur={() => config.set("sheetsAutoSyncTime", syncTime)}
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500"
                    />
                  </Row>
                )}

                {/* Último envio + Sincronizar agora */}
                <div className="py-2.5 flex items-center justify-between gap-3">
                  <span className="text-xs text-gray-500 shrink-0">
                    Último envio:{" "}
                    <span className="text-gray-300">{formatLastSync(lastSyncTs)}</span>
                  </span>
                  <button
                    onClick={handleSyncNow}
                    disabled={syncing}
                    className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 px-2.5 py-1.5 rounded transition-colors shrink-0"
                  >
                    {syncing ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    {syncing ? "Sincronizando…" : "Sincronizar agora"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Envio manual */}
        <div className="pt-2.5">
          <button
            onClick={() => setShowSendModal(true)}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors w-full justify-center border border-gray-700"
          >
            <Send size={12} />
            Enviar tarefas manualmente…
          </button>
        </div>
      </div>

      {showSendModal && (
        <SheetsSendModal
          projects={projects}
          categories={categories}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </>
  );
}

/* ── Sub-seção Google Calendar ── */

function CalendarSection({
  disabled,
  onNavigate,
}: {
  disabled: boolean;
  onNavigate: (page: Page) => void;
}) {
  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const calendarImporter = useMemo(
    () => (config.isLoaded ? new GoogleCalendarImporter(config) : null),
    [config.isLoaded], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const { fromISO, toISO, weekLabel } = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today);
    mon.setDate(today.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const fmtLabel = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
    return {
      fromISO: new Date(fmt(mon) + "T00:00:00").toISOString(),
      toISO: new Date(fmt(sun) + "T23:59:59").toISOString(),
      weekLabel: `${fmtLabel(mon)} — ${fmtLabel(sun)}/${sun.getFullYear()}`,
    };
  }, []);

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="py-2.5 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Importe eventos da semana atual como tarefas planejadas.
        </p>
        <button
          onClick={() => { setImportedCount(null); setShowImportModal(true); }}
          className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors shrink-0 ml-3"
        >
          <CalendarDays size={13} />
          Importar semana atual
        </button>
      </div>

      {importedCount !== null && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          <span className="text-xs text-green-300 flex-1">
            {importedCount} evento{importedCount !== 1 ? "s" : ""} importado{importedCount !== 1 ? "s" : ""}.
          </span>
          <button
            onClick={() => { setImportedCount(null); onNavigate("planning"); }}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Ver planejamento
            <ArrowRight size={11} />
          </button>
          <button
            onClick={() => setImportedCount(null)}
            className="text-gray-600 hover:text-gray-400 transition-colors ml-1"
          >
            <X size={12} />
          </button>
        </div>
      )}

      {showImportModal && calendarImporter && (
        <ImportCalendarModal
          importer={calendarImporter}
          repo={plannedRepo}
          fromISO={fromISO}
          toISO={toISO}
          weekLabel={weekLabel}
          projects={projects}
          categories={categories}
          onImported={(count) => { setShowImportModal(false); setImportedCount(count); }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

/* ── Card Google (unificado) ── */

function SubSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-gray-500">{icon}</span>
        <span className="text-sm font-medium text-gray-200">{title}</span>
        <span className="ml-auto text-gray-600">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="px-4 pb-2">{children}</div>}
    </div>
  );
}

function GoogleIntegrationCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("googleRefreshToken"));
    setEmail(config.get("googleUserEmail"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const tokens = await startGoogleOAuth(ALL_GOOGLE_SCOPES);
      const manager = new GoogleTokenManager(config);
      await manager.saveTokens(tokens);
      setConnected(true);
      setEmail(tokens.email);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao conectar com o Google.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    const manager = new GoogleTokenManager(config);
    await manager.clearTokens();
    setConnected(false);
    setEmail("");
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      {/* Header do card */}
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-800">
        <div className="mt-0.5 shrink-0">
          {/* Ícone Google simplificado */}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">Google</h2>
            <StatusBadge connected={connected} email={email} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Acesse o Sheets e o Calendar com uma única conta.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {error && <span className="text-xs text-red-400">{error}</span>}
          {connected ? (
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
            >
              <LogOut size={12} />
              Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded transition-colors"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <LogIn size={12} />}
              {loading ? "Aguardando…" : "Conectar com Google"}
            </button>
          )}
        </div>
      </div>

      {/* Sub-seções */}
      <SubSection icon={<TableProperties size={15} />} title="Google Sheets">
        <SheetsSection disabled={!connected} projects={projects} categories={categories} />
      </SubSection>
      <SubSection icon={<Calendar size={15} />} title="Google Calendar">
        <CalendarSection disabled={!connected} onNavigate={onNavigate} />
      </SubSection>
    </div>
  );
}

/* ── Page ── */

export function IntegrationsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  return (
    <div className="h-full overflow-y-auto">
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-100">Integrações</h1>
        <p className="text-xs text-gray-500 mt-1">
          Conecte o DeskClock a ferramentas externas para exportar e importar dados automaticamente.
        </p>
      </div>

      <GoogleIntegrationCard onNavigate={onNavigate} />
    </div>
    </div>
  );
}
