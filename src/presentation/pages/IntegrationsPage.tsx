import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { Autocomplete } from "@presentation/components/Autocomplete";
import { ClockifyConnectModal } from "@presentation/modals/ClockifyConnectModal";
import { ClockifySendModal } from "@presentation/modals/ClockifySendModal";
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

/* ── SVG Clockify ── */

function ClockifyLogo({ size = 20 }: { size?: number }) {
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
      <path
        d="M17 11.5H15V16.414L18.293 19.707L19.707 18.293L17 15.586V11.5Z"
        fill="white"
      />
    </svg>
  );
}

/* ── Card Clockify ── */

function ClockifyIntegrationCard() {
  const config = useAppConfig();
  const { projects, reload: reloadProjects } = useProjects();
  const { categories, reload: reloadCategories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

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
    </>
  );
}

/* ── Sub-seção Workspace ── */

function ClockifyWorkspaceSection() {
  const config = useAppConfig();
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
      const { ClockifyClient: CClient } = await import("@infra/integrations/clockify/ClockifyClient");
      const client = new CClient(config.get("clockifyApiKey"));
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
                <option key={w.id} value={w.id}>{w.name}</option>
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

interface ClockifyRef { id: string; name: string }

function TagMultiSelect({
  allTags,
  selectedIds,
  onChange,
}: {
  allTags: ClockifyRef[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]
    );
  }

  function openDropdown() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setDropStyle({
        position: "fixed",
        top: r.bottom + 4,
        right: window.innerWidth - r.right,
        minWidth: r.width,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !dropRef.current?.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const selected = allTags.filter((t) => selectedIds.includes(t.id));

  return (
    <div>
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="flex flex-wrap items-center gap-1 min-w-[180px] max-w-[260px] bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-left focus:outline-none focus:border-blue-500"
      >
        {selected.length === 0 ? (
          <span className="text-gray-500">Nenhuma tag</span>
        ) : (
          selected.map((t) => (
            <span key={t.id} className="bg-gray-700 text-gray-200 px-1.5 py-0.5 rounded text-[10px]">
              {t.name}
            </span>
          ))
        )}
        <ChevronDown size={11} className="ml-auto shrink-0 text-gray-500" />
      </button>
      {open &&
        createPortal(
          <div
            ref={dropRef}
            style={dropStyle}
            className="z-[9999] bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-52 max-h-48 overflow-y-auto"
          >
            {allTags.length === 0 ? (
              <p className="text-xs text-gray-500 px-3 py-2">Nenhuma tag disponível</p>
            ) : (
              allTags.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(t.id)}
                    onChange={() => toggle(t.id)}
                    className="accent-blue-500"
                  />
                  <span className="text-xs text-gray-200">{t.name}</span>
                </label>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
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
            onClick={() => { setInputValue(""); onUpdate(project.id, ""); }}
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
  const config = useAppConfig();
  const [clockifyProjects, setClockifyProjects] = useState<ClockifyRef[]>([]);
  const [clockifyTags, setClockifyTags] = useState<ClockifyRef[]>([]);
  const [projectMapping, setProjectMapping] = useState<import("@shared/types/clockifyConfig").ClockifyProjectMapping[]>([]);
  const [categoryMapping, setCategoryMapping] = useState<import("@shared/types/clockifyConfig").ClockifyCategoryMapping[]>([]);
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
    return import("@infra/integrations/clockify/ClockifyClient").then(
      ({ ClockifyClient: C }) => new C(config.get("clockifyApiKey"))
    );
  }

  function projectDisplayName(p: { name: string; clientName?: string | null }) {
    return p.clientName ? `${p.clientName} - ${p.name}` : p.name;
  }

  async function fetchProjects() {
    setLoadingProjects(true);
    try {
      const client = await getClient();
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
      const client = await getClient();
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
      const client = await getClient();
      const list = await client.listProjects(workspaceId);
      const sortedProjects = list
        .map((p) => ({ id: p.id, name: projectDisplayName(p) }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      setClockifyProjects(sortedProjects);

      const { ProjectRepository } = await import("@infra/database/ProjectRepository");
      const { createProject: createProjectUC } = await import("@domain/usecases/projects/CreateProject");
      const repo = new ProjectRepository();

      const allPM = config.get("clockifyProjectMapping");
      const otherWS = allPM.filter((m) => m.workspaceId !== workspaceId);
      const newMappings: import("@shared/types/clockifyConfig").ClockifyProjectMapping[] = [];

      for (const cp of list) {
        let proj = await repo.findByName(cp.name);
        if (!proj) {
          try {
            proj = await createProjectUC(repo, cp.name);
          } catch {
            proj = await repo.findByName(cp.name);
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
      const client = await getClient();
      const list = await client.listTags(workspaceId);
      setClockifyTags(list.map((t) => ({ id: t.id, name: t.name })));

      const { CategoryRepository } = await import("@infra/database/CategoryRepository");
      const { createCategory: createCategoryUC } = await import("@domain/usecases/categories/CreateCategory");
      const repo = new CategoryRepository();

      const allCM = config.get("clockifyCategoryMapping");
      const otherWS = allCM.filter((m) => m.workspaceId !== workspaceId);
      const newMappings: import("@shared/types/clockifyConfig").ClockifyCategoryMapping[] = [];

      for (const tag of list) {
        let cat = await repo.findByName(tag.name);
        if (!cat) {
          try {
            cat = await createCategoryUC(repo, tag.name, true);
          } catch {
            cat = await repo.findByName(tag.name);
          }
        }
        if (!cat) continue;
        const existingTagIds = allCM.find(
          (m) => m.deskclockCategoryId === cat!.id && m.workspaceId === workspaceId
        )?.clockifyTagIds ?? [];
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
                    Importar cria categorias no DeskClock para cada tag e as vincula automaticamente.
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
    <div className="border-t border-gray-800 px-4 py-3">
      <Row label="Sincronização automática">
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
                          syncTrigger === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"
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
                  <span className="text-gray-300">{lastSyncTs ? formatLastSync(lastSyncTs) : "Nunca"}</span>
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface ClockifyConnectedSectionsProps {
  projects: import("@domain/entities/Project").Project[];
  categories: import("@domain/entities/Category").Category[];
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
  onShowSendModal: () => void;
}

function ClockifyConnectedSections({
  projects,
  categories,
  reloadProjects,
  reloadCategories,
  onShowSendModal,
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
      <div className="border-t border-gray-800 px-4 py-3">
        <button
          onClick={onShowSendModal}
          className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors w-full justify-center border border-gray-700"
        >
          <Send size={12} />
          Enviar tarefas manualmente…
        </button>
      </div>
    </>
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

      <div className="space-y-4">
        <GoogleIntegrationCard onNavigate={onNavigate} />
        <ClockifyIntegrationCard />
      </div>
    </div>
    </div>
  );
}
