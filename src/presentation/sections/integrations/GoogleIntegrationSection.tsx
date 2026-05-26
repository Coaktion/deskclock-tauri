import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import { startGoogleOAuth } from "@infra/integrations/google/GoogleOAuth";
import { GoogleTokenManager } from "@infra/integrations/google/GoogleTokenManager";
import { runDailyTemplate } from "@infra/integrations/runDailyTemplate";
import { validateTaskForSheets } from "@domain/integrations/taskValidation";
import { type Page } from "@presentation/components/Sidebar";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useAutoSync, SHEETS_INTEGRATION_NAME } from "@presentation/contexts/AutoSyncContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTour } from "@presentation/hooks/useTour";
import { ImportCalendarModal } from "@presentation/modals/ImportCalendarModal";
import { SheetsSendModal } from "@presentation/modals/SheetsSendModal";
import {
  DEFAULT_COLUMN_MAPPING,
  type SheetColumn,
  type SheetColumnMapping,
} from "@shared/types/sheetsConfig";
import { formatLastSync, todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Info,
  Loader2,
  LogIn,
  LogOut,
  RefreshCw,
  Send,
  TableProperties,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { IntegrationTile, Row, StatusBadge, SubSection, Toggle } from "./shared";

// Escopos unificados — uma única conexão Google para todos os serviços
export const ALL_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.readonly",
  "openid",
  "email",
];

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

function SheetsSection({
  disabled,
  projects,
  categories,
}: {
  disabled: boolean;
  projects: Project[];
  categories: Category[];
}) {
  const { taskRepo, taskLogRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const { isSyncing } = useAutoSync();
  const autoSyncing = isSyncing(SHEETS_INTEGRATION_NAME);
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
      const result = await runDailyTemplate(
        {
          integrationName: "Google Sheets",
          integrationLabel: "Google Sheets",
          logKey: "google_sheets",
          taskRepo,
          logRepo: taskLogRepo,
          timestampPort: {
            get: () => config.get("sheetsDailySyncLastTimestamp"),
            set: (iso) => config.set("sheetsDailySyncLastTimestamp", iso),
          },
          validate: (t) => validateTaskForSheets(t).ok,
          createSender: () =>
            factories.createSheetsTaskSender({ spreadsheetId: spreadsheet, projects, categories }),
        },
        todayISO()
      );

      if (result.error) {
        await showToast("error", result.error.message);
        return;
      }

      if (result.count === 0) {
        if (result.warning) {
          await showToast("warning", result.warning, 6000);
        } else {
          await showToast("success", "Tudo sincronizado — nenhuma tarefa nova encontrada.");
        }
        return;
      }

      // template já atualizou timestamp via timestampPort.set
      setLastSyncTs(config.get("sheetsDailySyncLastTimestamp"));
      const successMsg = `${result.count} tarefa(s) enviada(s) para o Sheets.`;
      if (result.warning) {
        await showToast("warning", `${successMsg} ${result.warning}`, 6000);
      } else {
        await showToast("success", successMsg);
      }
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
        <div data-tour="google-sheets-columns" className="py-2.5 border-b border-gray-800">
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
        <div data-tour="google-sheets-autosync">
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
                      disabled={syncing || autoSyncing}
                      title={autoSyncing ? "Sincronização automática em andamento…" : undefined}
                      className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 px-2.5 py-1.5 rounded transition-colors shrink-0"
                    >
                      {syncing || autoSyncing ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <RefreshCw size={11} />
                      )}
                      {autoSyncing
                        ? "Sincronização automática…"
                        : syncing
                          ? "Sincronizando…"
                          : "Sincronizar agora"}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* /google-sheets-autosync */}

        {/* Envio manual */}
        <div className="pt-2.5">
          <button
            onClick={() => setShowSendModal(true)}
            disabled={autoSyncing}
            title={autoSyncing ? "Sincronização automática em andamento…" : undefined}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 px-3 py-1.5 rounded transition-colors w-full justify-center border border-gray-700"
          >
            {autoSyncing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {autoSyncing ? "Sincronização automática em andamento…" : "Enviar tarefas manualmente…"}
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
  const { plannedTaskRepo } = useRepositories();
  const config = useAppConfig();
  const factories = useIntegrations();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [showImportModal, setShowImportModal] = useState(false);
  const [importedCount, setImportedCount] = useState<number | null>(null);

  const calendarImporter = useMemo(
    () => (config.isLoaded ? factories.createCalendarImporter() : null),
    [config.isLoaded, factories]
  );

  const { defaultFromISO, defaultToISO } = useMemo(() => {
    const today = new Date();
    const dow = today.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today);
    mon.setDate(today.getDate() + diffToMon);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      defaultFromISO: new Date(fmt(mon) + "T00:00:00").toISOString(),
      defaultToISO: new Date(fmt(sun) + "T23:59:59").toISOString(),
    };
  }, []);

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <div className="py-2.5 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Importe eventos do Google Agenda como tarefas planejadas.
        </p>
        <button
          onClick={() => {
            setImportedCount(null);
            setShowImportModal(true);
          }}
          className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors shrink-0 ml-3 border border-gray-700"
        >
          <CalendarDays size={13} />
          Importar eventos
        </button>
      </div>
      <div className="flex items-start gap-2 mb-2 p-2.5 bg-blue-950/40 border border-blue-800/50 rounded-lg">
        <Info size={12} className="text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-blue-300 leading-relaxed">
          Adicione na descrição do evento para pré-preencher projeto e categoria ao importar:
          <br />
          <span className="font-mono text-blue-200">Projeto: Nome do Projeto</span>
          <br />
          <span className="font-mono text-blue-200">Categoria: Nome da Categoria</span>
        </p>
      </div>

      {importedCount !== null && (
        <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          <span className="text-xs text-green-300 flex-1">
            {importedCount} evento{importedCount !== 1 ? "s" : ""} importado
            {importedCount !== 1 ? "s" : ""}.
          </span>
          <button
            onClick={() => {
              setImportedCount(null);
              onNavigate("planning");
            }}
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
          repo={plannedTaskRepo}
          defaultFromISO={defaultFromISO}
          defaultToISO={defaultToISO}
          projects={projects}
          categories={categories}
          onImported={(count) => {
            setShowImportModal(false);
            setImportedCount(count);
          }}
          onClose={() => setShowImportModal(false)}
        />
      )}
    </div>
  );
}

/* ── Card Google (unificado) ── */

export function GoogleIntegrationCard({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const config = useAppConfig();
  const { projects } = useProjects();
  const { categories } = useCategories();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { startTour, hasSeenTour } = useTour("google-detail");

  useEffect(() => {
    if (!config.isLoaded) return;
    setConnected(!!config.get("googleRefreshToken"));
    setEmail(config.get("googleUserEmail"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div
        data-tour="google-header"
        className="flex items-start gap-3 px-4 py-3 border-b border-gray-800"
      >
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
          <button
            onClick={() => startTour()}
            title="Ver tour da integração"
            className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center"
          >
            ?
          </button>
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
      <div data-tour="google-sheets-section">
        <SubSection icon={<TableProperties size={15} />} title="Google Sheets">
          <SheetsSection disabled={!connected} projects={projects} categories={categories} />
        </SubSection>
      </div>
      <div data-tour="google-calendar-section">
        <SubSection icon={<Calendar size={15} />} title="Google Calendar">
          <CalendarSection disabled={!connected} onNavigate={onNavigate} />
        </SubSection>
      </div>
    </div>
  );
}

export function GoogleTile({ onClick }: { onClick: () => void }) {
  const config = useAppConfig();
  const connected = config.isLoaded && !!config.get("googleRefreshToken");
  const email = config.isLoaded ? config.get("googleUserEmail") : "";
  const sheetsConfigured = config.isLoaded && !!config.get("integrationGoogleSheetsSpreadsheetId");

  return (
    <IntegrationTile
      onClick={onClick}
      logo={
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
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
      }
      name="Google"
      description="Sheets e Calendar com uma única conta"
      connected={connected}
      email={email}
      subBadges={
        connected
          ? [
              { label: "Sheets", active: sheetsConfigured },
              { label: "Calendar", active: true },
            ]
          : undefined
      }
    />
  );
}
