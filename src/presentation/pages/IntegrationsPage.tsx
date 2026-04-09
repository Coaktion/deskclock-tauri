import { useEffect, useState } from "react";
import { TableProperties, Calendar, CheckCircle2, Circle, LogIn, LogOut, Loader2, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { startGoogleOAuth } from "@infra/integrations/google/GoogleOAuth";
import { GoogleTokenManager } from "@infra/integrations/google/GoogleTokenManager";
import { DEFAULT_COLUMN_MAPPING, type SheetColumn, type SheetColumnMapping } from "@shared/types/sheetsConfig";

const SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "openid",
  "email",
];

const CALENDAR_SCOPES = [
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

function IntegrationCard({
  icon, title, description, connected, email, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  connected: boolean;
  email?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/50 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-800">
        <div className="mt-0.5 text-gray-400">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-100">{title}</h2>
            <StatusBadge connected={connected} email={email} />
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="px-4 py-1">{children}</div>
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.field });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-2 py-1.5 rounded ${col.enabled ? "bg-gray-800/50" : "bg-gray-900/30 opacity-60"}`}
    >
      <button {...attributes} {...listeners} className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0">
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

  function toggleEnabled(idx: number) {
    onChange(mapping.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c));
  }

  function setLabel(idx: number, label: string) {
    onChange(mapping.map((c, i) => i === idx ? { ...c, label } : c));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={mapping.map((c) => c.field)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {mapping.map((col, idx) => (
            <SortableSheetColumn key={col.field} col={col} idx={idx} onToggle={toggleEnabled} onRename={setLabel} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ── Google Sheets ── */

function GoogleSheetsIntegration() {
  const config = useAppConfig();
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [sheetName, setSheetName] = useState("DeskClock");
  const [columnMapping, setColumnMapping] = useState<SheetColumnMapping>(DEFAULT_COLUMN_MAPPING);
  const [autoSync, setAutoSync] = useState(false);
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colsOpen, setColsOpen] = useState(false);

  useEffect(() => {
    if (!config.isLoaded) return;
    setSpreadsheetId(config.get("integrationGoogleSheetsSpreadsheetId"));
    setSheetName(config.get("integrationGoogleSheetsSheetName") || "DeskClock");
    setColumnMapping(config.get("integrationGoogleSheetsColumnMapping") ?? DEFAULT_COLUMN_MAPPING);
    setAutoSync(config.get("integrationGoogleSheetsAutoSync"));
    setConnected(!!config.get("googleRefreshToken"));
    setEmail(config.get("googleUserEmail"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSpreadsheetIdBlur() {
    await config.set("integrationGoogleSheetsSpreadsheetId", spreadsheetId.trim());
  }

  async function handleSheetNameBlur() {
    const name = sheetName.trim() || "DeskClock";
    setSheetName(name);
    await config.set("integrationGoogleSheetsSheetName", name);
  }

  async function handleColumnMappingChange(next: SheetColumnMapping) {
    setColumnMapping(next);
    await config.set("integrationGoogleSheetsColumnMapping", next);
  }

  async function handleAutoSync(value: boolean) {
    setAutoSync(value);
    await config.set("integrationGoogleSheetsAutoSync", value);
  }

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const tokens = await startGoogleOAuth(SHEETS_SCOPES);
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
    <IntegrationCard
      icon={<TableProperties size={20} />}
      title="Google Sheets"
      description="Envie tarefas registradas para uma planilha no Google."
      connected={connected}
      email={email}
    >
      <Row label="ID da planilha">
        <input
          type="text"
          value={spreadsheetId}
          onChange={(e) => setSpreadsheetId(e.target.value)}
          onBlur={handleSpreadsheetIdBlur}
          placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
          className="w-72 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
        />
      </Row>
      <Row label="Nome da aba">
        <input
          type="text"
          value={sheetName}
          onChange={(e) => setSheetName(e.target.value)}
          onBlur={handleSheetNameBlur}
          placeholder="DeskClock"
          className="w-48 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
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

      <Row label="Sincronizar automaticamente ao concluir tarefa">
        <Toggle checked={autoSync} onChange={handleAutoSync} />
      </Row>
      <Row label="Autorização Google">
        {error && <span className="text-xs text-red-400 mr-2">{error}</span>}
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
            {loading ? "Aguardando autorização…" : "Conectar com Google"}
          </button>
        )}
      </Row>
    </IntegrationCard>
  );
}

/* ── Google Calendar ── */

function GoogleCalendarIntegration() {
  const config = useAppConfig();
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
      const tokens = await startGoogleOAuth(CALENDAR_SCOPES);
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
    <IntegrationCard
      icon={<Calendar size={20} />}
      title="Google Calendar"
      description="Importe eventos do Google Calendar como tarefas planejadas."
      connected={connected}
      email={email}
    >
      <Row label="Autorização Google">
        {error && <span className="text-xs text-red-400 mr-2">{error}</span>}
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
            {loading ? "Aguardando autorização…" : "Conectar com Google"}
          </button>
        )}
      </Row>
      {connected && (
        <Row label="Importar eventos">
          <span className="text-xs text-gray-500 italic">
            Disponível na tela de Planejamento (em breve)
          </span>
        </Row>
      )}
    </IntegrationCard>
  );
}

/* ── Page ── */

export function IntegrationsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-gray-100">Integrações</h1>
        <p className="text-xs text-gray-500 mt-1">
          Conecte o DeskClock a ferramentas externas para exportar e importar dados automaticamente.
        </p>
      </div>

      <div className="space-y-4">
        <GoogleSheetsIntegration />
        <GoogleCalendarIntegration />
      </div>
    </div>
  );
}
