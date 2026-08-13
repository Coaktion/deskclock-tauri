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
import {
  BACKUP_FOLDER_NAME,
  DRIVE_RECONNECT_MESSAGE,
} from "@infra/integrations/googledrive/GoogleDriveClient";
import { runDailyTemplate } from "@infra/integrations/runDailyTemplate";
import { validateTaskForSheets } from "@domain/integrations/taskValidation";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useAutoSync, SHEETS_INTEGRATION_NAME } from "@presentation/contexts/AutoSyncContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useIntegrationsUi } from "@presentation/contexts/IntegrationsUiContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useProjects } from "@presentation/hooks/useProjects";
import { useTour } from "@presentation/hooks/useTour";
import { useSyncNowButton, type SyncFeedback } from "@presentation/hooks/useSyncNowButton";
import type { BackupFrequency } from "@shared/types/appConfig";
import {
  DEFAULT_COLUMN_MAPPING,
  type SheetColumn,
  type SheetColumnMapping,
} from "@shared/types/sheetsConfig";
import { formatLastSync, todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  DatabaseBackup,
  GripVertical,
  Info,
  LogIn,
  LogOut,
  RefreshCw,
  Send,
  TableProperties,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  DeskclockWorkspaceRow,
  IntegrationTile,
  Row,
  StatusBadge,
  SubSection,
  SyncFeedbackLine,
} from "./shared";
import { Button, Input, SegmentedControl, TourButton, Toggle } from "@presentation/components/ui";
import { GoogleLogo } from "./google/GoogleLogo";
import { OVERLAY_EVENTS, type MeetingTrackerSyncResultPayload } from "@shared/types/overlayEvents";

const DURATION_FORMATS = [
  { value: "HH:MM", label: "HH:MM" },
  { value: "HH:MM:SS", label: "HH:MM:SS" },
] as const;
const SYNC_MODES = [
  { value: "per-task", label: "Por tarefa" },
  { value: "daily", label: "Diário" },
] as const;
const SYNC_TRIGGERS = [
  { value: "on-open", label: "Ao abrir o app" },
  { value: "fixed-time", label: "Horário fixo" },
] as const;
const BACKUP_FREQUENCIES = [
  { value: "daily", label: "Diário" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensal" },
] as const;

// Escopos unificados — uma única conexão Google para todos os serviços
export const ALL_GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/calendar.readonly",
  // Só o que o próprio app criou — escopo não sensível, que dispensa a
  // verificação de segurança que o `drive` amplo exigiria. Quem já conectou o
  // Google **precisa reconectar**: o refresh_token guardado carrega os escopos
  // do consentimento, e acrescentar aqui não revalida nada (ver `BackupSection`).
  "https://www.googleapis.com/auth/drive.file",
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
      className={`flex items-center gap-2 px-2 py-1.5 rounded-chip ${col.enabled ? "bg-raised" : "bg-surface opacity-60"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-fg-muted hover:text-fg cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={14} />
      </button>
      <Toggle
        ariaLabel={`Exibir coluna ${col.label}`}
        checked={col.enabled}
        onChange={() => onToggle(idx)}
      />
      <Input
        variant="plain"
        size="sm"
        value={col.label}
        onChange={(e) => onRename(idx, e.target.value)}
        disabled={!col.enabled}
        className="flex-1 border-b border-border focus:border-accent py-0.5"
      />
      <span className="text-xs text-fg-muted w-16 shrink-0">{col.field}</span>
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
  const [syncing, setSyncing] = useState(false);
  const { openModal } = useIntegrationsUi();

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
          // O mesmo recorte do envio automático: o botão manda o dia do
          // workspace da integração, não o de quem estiver aberto na tela.
          workspaceId: resolveIntegrationWorkspaceId(config.get("sheetsDeskclockWorkspaceId")),
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
        <DeskclockWorkspaceRow
          configKey="sheetsDeskclockWorkspaceId"
          hint="De qual workspace saem as tarefas enviadas à planilha."
          className="py-2.5 border-b border-border-subtle"
        />
        <Row label="ID da planilha">
          <Input
            size="sm"
            value={spreadsheetId}
            onChange={(e) => setSpreadsheetId(e.target.value)}
            onBlur={() => config.set("integrationGoogleSheetsSpreadsheetId", spreadsheetId.trim())}
            placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
            className="w-64"
          />
        </Row>
        <Row label="Nome da aba">
          <Input
            size="sm"
            value={sheetName}
            onChange={(e) => setSheetName(e.target.value)}
            onBlur={async () => {
              const name = sheetName.trim() || "DeskClock";
              setSheetName(name);
              await config.set("integrationGoogleSheetsSheetName", name);
            }}
            placeholder="DeskClock"
            className="w-40"
          />
        </Row>

        {/* Mapeamento de colunas */}
        <div data-tour="google-sheets-columns" className="py-2.5 border-b border-border-subtle">
          <Button
            variant="ghost"
            expanded={colsOpen}
            onClick={() => setColsOpen((v) => !v)}
            icon={colsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            className="w-full justify-start text-sm text-fg-secondary hover:text-fg"
          >
            Mapeamento de colunas
            <span className="ml-auto text-xs text-fg-muted">
              {columnMapping.filter((c) => c.enabled).length}/{columnMapping.length} ativas
            </span>
          </Button>
          {colsOpen && (
            <div className="mt-2">
              <p className="text-xs text-fg-muted mb-2">
                Ative/desative colunas, edite os rótulos e reordene conforme a planilha.
              </p>
              <ColumnMappingEditor mapping={columnMapping} onChange={handleColumnMappingChange} />
            </div>
          )}
        </div>

        <Row label="Formato da duração">
          <SegmentedControl
            value={durationFormat}
            options={DURATION_FORMATS}
            ariaLabel="Formato da duração"
            onChange={handleDurationFormat}
          />
        </Row>

        {/* Sincronização automática */}
        <div data-tour="google-sheets-autosync">
          <Row label="Sincronização automática">
            <Toggle
              ariaLabel="Ativar sincronização automática"
              checked={autoSync}
              onChange={async (v) => {
                setAutoSync(v);
                await config.set("integrationGoogleSheetsAutoSync", v);
              }}
            />
          </Row>

          {autoSync && (
            <div className="pl-4 border-l border-border-subtle ml-1 mb-1">
              {/* Modo */}
              <div className="py-2.5 border-b border-border-subtle">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg-secondary">Modo</span>
                  <SegmentedControl
                    value={syncMode}
                    options={SYNC_MODES}
                    ariaLabel="Modo de sincronização"
                    onChange={async (m) => {
                      setSyncMode(m);
                      await config.set("sheetsAutoSyncMode", m);
                    }}
                  />
                </div>
                <p className="text-xs text-fg-muted mt-1.5">
                  {syncMode === "per-task"
                    ? "Envia cada tarefa automaticamente ao ser concluída, em tempo real."
                    : "Agrupa e envia de uma vez, cobrindo fins de semana e dias perdidos."}
                </p>
              </div>

              {syncMode === "daily" && (
                <>
                  {/* Gatilho */}
                  <div className="py-2.5 border-b border-border-subtle">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-fg-secondary">Gatilho</span>
                      <SegmentedControl
                        value={syncTrigger}
                        options={SYNC_TRIGGERS}
                        ariaLabel="Gatilho da sincronização"
                        onChange={async (t) => {
                          setSyncTrigger(t);
                          await config.set("sheetsAutoSyncTrigger", t);
                        }}
                      />
                    </div>
                    <p className="text-xs text-fg-muted mt-1.5">
                      {syncTrigger === "on-open"
                        ? "Envia ao abrir o app as tarefas de ontem para trás, desde o último envio automático."
                        : "Envia no horário definido as tarefas do dia corrente e dias anteriores não sincronizados."}
                    </p>
                  </div>

                  {syncTrigger === "fixed-time" && (
                    <Row label="Horário">
                      <Input
                        type="time"
                        size="sm"
                        value={syncTime}
                        onChange={(e) => setSyncTime(e.target.value)}
                        onBlur={() => config.set("sheetsAutoSyncTime", syncTime)}
                        className="w-auto!"
                      />
                    </Row>
                  )}

                  {/* Último envio + Sincronizar agora */}
                  <div className="py-2.5 flex items-center justify-between gap-3">
                    <span className="text-xs text-fg-muted shrink-0">
                      Último envio:{" "}
                      <span className="text-fg-secondary">{formatLastSync(lastSyncTs)}</span>
                    </span>
                    <Button
                      onClick={handleSyncNow}
                      loading={syncing || autoSyncing}
                      title={autoSyncing ? "Sincronização automática em andamento…" : undefined}
                      icon={<RefreshCw size={14} />}
                      className="shrink-0"
                    >
                      {autoSyncing
                        ? "Sincronização automática…"
                        : syncing
                          ? "Sincronizando…"
                          : "Sincronizar agora"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        {/* /google-sheets-autosync */}

        {/* Envio manual */}
        <div className="pt-2.5">
          <Button
            onClick={() => openModal("sheets-send")}
            loading={autoSyncing}
            title={autoSyncing ? "Sincronização automática em andamento…" : undefined}
            icon={<Send size={14} />}
            className="w-full"
          >
            {autoSyncing ? "Sincronização automática em andamento…" : "Enviar tarefas manualmente…"}
          </Button>
        </div>
      </div>
    </>
  );
}

/* ── Sub-seção Google Calendar ── */

/**
 * Payload do rastreador → frase abaixo do botão. Só o erro merece frase: o
 * sucesso já vira toast no próprio rastreador, e devolver `null` aqui é o que
 * apaga da tela um erro que deixou de valer.
 */
function describeMeetingSync(payload: MeetingTrackerSyncResultPayload): SyncFeedback | null {
  return payload.error ? { ok: false, text: payload.error } : null;
}

function CalendarSection({ disabled }: { disabled: boolean }) {
  const { openModal } = useIntegrationsUi();
  const config = useAppConfig();
  const [autoTracking, setAutoTracking] = useState(false);
  // O fim do ciclo chega por evento — inclusive o do ciclo automático, que é o que
  // faz a linha de erro sumir sozinha quando a busca volta a funcionar.
  const { searching, feedback, setFeedback, trigger } =
    useSyncNowButton<MeetingTrackerSyncResultPayload>(
      OVERLAY_EVENTS.MEETING_TRACKER_SYNC_NOW,
      OVERLAY_EVENTS.MEETING_TRACKER_SYNC_RESULT,
      describeMeetingSync
    );

  useEffect(() => {
    if (!config.isLoaded) return;
    setAutoTracking(config.get("calendarAutoTrackingEnabled"));
    // A falha do último ciclo fica na config: sem semear, abrir a tela esconderia
    // um erro que continua valendo até o próximo ciclo responder.
    const persisted = config.get("calendarLastSyncError");
    if (persisted) setFeedback({ ok: false, text: persisted });
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      {/*
        Governa **só** o "Importar eventos" abaixo. O rastreio automático de
        reuniões continua criando no workspace **ativo** — decisão registrada
        (ver §5.7), não descuido: não "conserte" sem perguntar.
      */}
      <DeskclockWorkspaceRow
        configKey="calendarDeskclockWorkspaceId"
        hint="Destino do 'Importar eventos'. O rastreio automático de reuniões continua criando no workspace aberto na tela."
        className="py-2.5 border-b border-border-subtle"
      />
      <div className="py-2.5 flex items-center justify-between">
        <p className="text-sm text-fg-muted">
          Importe eventos do Google Agenda como tarefas planejadas.
        </p>
        <Button
          onClick={() => openModal("calendar-import")}
          icon={<CalendarDays size={14} />}
          className="shrink-0 ml-3"
        >
          Importar eventos
        </Button>
      </div>
      <div className="border-t border-border-subtle">
        <Row label="Rastrear reuniões automaticamente">
          <Toggle
            ariaLabel="Rastrear reuniões automaticamente"
            checked={autoTracking}
            onChange={async (v) => {
              setAutoTracking(v);
              await config.set("calendarAutoTrackingEnabled", v);
            }}
          />
        </Row>
        <p className="text-body text-fg-muted leading-relaxed pb-2.5">
          Ao abrir o app e a cada 2 minutos, busca os eventos do dia e pergunta, no horário de
          início, se deseja iniciar cada reunião. Ao fim do evento, pergunta se ainda está em
          andamento.
        </p>
        {autoTracking && (
          <div className="pb-2.5">
            <Button
              onClick={trigger}
              disabled={searching}
              icon={<RefreshCw size={14} className={searching ? "animate-spin" : ""} />}
            >
              {searching ? "Buscando…" : "Buscar eventos agora"}
            </Button>
            {feedback && !searching && <SyncFeedbackLine feedback={feedback} />}
          </div>
        )}
      </div>
      <div className="flex items-start gap-2 mb-2 p-2.5 bg-accent/5 border border-accent/20 rounded-control">
        <Info size={14} className="text-accent-text shrink-0 mt-0.5" />
        <p className="text-body text-accent-text leading-relaxed">
          Adicione na descrição do evento para pré-preencher projeto e categoria ao importar:
          <br />
          <span className="font-mono text-accent-text">Projeto: Nome do Projeto</span>
          <br />
          <span className="font-mono text-accent-text">Categoria: Nome da Categoria</span>
        </p>
      </div>
    </div>
  );
}

/* ── Sub-seção Backup do banco ── */

/**
 * O backup do banco no Drive. Mora no card do Google, e não numa integração
 * própria, porque é a **mesma conexão OAuth** de Sheets e Agenda — um card, N
 * chaves — e é aqui que o aviso de reconexão precisa estar.
 *
 * Não há seletor de workspace, e não é esquecimento: o backup é do banco
 * inteiro, que atravessa todos eles (§2.1 de `docs/specs/backup-google-drive.md`).
 */
function BackupSection({ disabled }: { disabled: boolean }) {
  const config = useAppConfig();
  const { createDriveBackupRunner } = useIntegrations();
  const [enabled, setEnabled] = useState(false);
  const [frequency, setFrequency] = useState<BackupFrequency>("weekly");
  const [lastRunAt, setLastRunAt] = useState(0);
  const [lastError, setLastError] = useState("");
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setEnabled(config.get("driveBackupEnabled"));
    setFrequency(config.get("driveBackupFrequency"));
    setLastRunAt(config.get("driveBackupLastRunAt"));
    // A falha do agendador fica na config: sem semear, abrir a tela esconderia
    // um erro que continua valendo até o próximo ciclo responder.
    setLastError(config.get("driveBackupLastError"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleBackupNow() {
    setRunning(true);
    try {
      await createDriveBackupRunner().run();
      setLastRunAt(config.get("driveBackupLastRunAt"));
      setLastError("");
      await showToast("success", "Backup enviado para o Google Drive.");
    } catch {
      // O runner já gravou a mensagem, e é dela que a linha abaixo vive — ela
      // sobrevive a sair e voltar da tela, o toast não.
      setLastError(config.get("driveBackupLastError"));
    } finally {
      setRunning(false);
    }
  }

  // O 403 do escopo faltante é o único erro com saída conhecida, e a saída não é
  // "tentar de novo": vira o aviso de reconexão, no lugar da linha de falha.
  const needsReconnect = lastError === DRIVE_RECONNECT_MESSAGE;

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : ""}>
      <p className="text-body text-fg-muted leading-relaxed py-2.5">
        Envia uma cópia do banco para a pasta {BACKUP_FOLDER_NAME}, no seu Drive. As chaves das
        integrações ficam de fora da cópia — ao restaurar, reconecte-as.
      </p>
      <Row label="Backup automático">
        <Toggle
          ariaLabel="Ativar backup automático"
          checked={enabled}
          onChange={async (v) => {
            setEnabled(v);
            await config.set("driveBackupEnabled", v);
          }}
        />
      </Row>
      {enabled && (
        <Row label="Frequência">
          <SegmentedControl
            value={frequency}
            options={BACKUP_FREQUENCIES}
            ariaLabel="Frequência do backup"
            onChange={async (f) => {
              setFrequency(f);
              await config.set("driveBackupFrequency", f);
            }}
          />
        </Row>
      )}
      <div className="py-2.5 flex items-center justify-between gap-3">
        <span className="text-xs text-fg-muted shrink-0">
          Último backup:{" "}
          <span className="text-fg-secondary">
            {formatLastSync(lastRunAt ? new Date(lastRunAt).toISOString() : "")}
          </span>
        </span>
        <Button
          variant="secondary"
          onClick={handleBackupNow}
          loading={running}
          icon={<DatabaseBackup size={14} />}
          className="shrink-0"
        >
          {running ? "Enviando…" : "Fazer backup agora"}
        </Button>
      </div>
      {needsReconnect ? (
        <div className="flex items-start gap-2 mb-2 p-2.5 bg-warning/5 border border-warning/20 rounded-control">
          <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
          <p className="text-body text-fg-secondary leading-relaxed">
            O backup precisa de acesso ao Drive, e a conexão atual não o concedeu. Desconecte e
            conecte o Google outra vez — Sheets e Agenda seguem funcionando como estão.
          </p>
        </div>
      ) : (
        lastError && <SyncFeedbackLine feedback={{ ok: false, text: lastError }} />
      )}
    </div>
  );
}

/* ── Card Google (unificado) ── */

export function GoogleIntegrationCard() {
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
    <div className="rounded-card border border-border-subtle bg-surface overflow-hidden">
      {/* Header do card */}
      <div
        data-tour="google-header"
        className="flex items-start gap-3 px-4 py-3 border-b border-border-subtle"
      >
        <div className="mt-0.5 shrink-0">
          <GoogleLogo size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-fg">Google</h2>
            <StatusBadge connected={connected} email={email} />
          </div>
          <p className="text-xs text-fg-muted mt-0.5">
            Acesse o Sheets e o Calendar com uma única conta.
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          {error && <span className="text-xs text-danger">{error}</span>}
          <TourButton onClick={() => startTour()} label="Ver tour da integração" />
          {connected ? (
            <Button onClick={handleDisconnect} icon={<LogOut size={14} />}>
              Desconectar
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={handleConnect}
              loading={loading}
              icon={<LogIn size={14} />}
            >
              {loading ? "Aguardando…" : "Conectar com Google"}
            </Button>
          )}
        </div>
      </div>

      {/* Sub-seções */}
      <div data-tour="google-sheets-section">
        <SubSection icon={<TableProperties size={14} />} title="Google Sheets">
          <SheetsSection disabled={!connected} projects={projects} categories={categories} />
        </SubSection>
      </div>
      <div data-tour="google-calendar-section">
        <SubSection icon={<Calendar size={14} />} title="Google Calendar">
          <CalendarSection disabled={!connected} />
        </SubSection>
      </div>
      <SubSection icon={<DatabaseBackup size={14} />} title="Backup do banco">
        <BackupSection disabled={!connected} />
      </SubSection>
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
      logo={<GoogleLogo size={20} />}
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
