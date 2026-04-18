import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme, THEMES } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { useUpdater } from "@presentation/hooks/useUpdater";
import { RefreshCw, Download, RotateCcw, AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
          value ? "bg-blue-600" : "bg-gray-700"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

function SliderRow({
  label,
  description,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-200">{label}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
        <span className="text-sm text-gray-400 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-600"
      />
    </div>
  );
}

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "CmdOrCtrl"]);
const KEY_MAP: Record<string, string> = {
  " ": "Space",
  Control: "Ctrl",
  Meta: "Super",
};

/**
 * Extrai a tecla base a partir de e.code para evitar que Shift+1 vire "!"
 * em vez de "1". e.code retorna o identificador físico da tecla independente
 * de modificadores: "Digit1", "KeyA", "Space", "F5", etc.
 */
function baseKeyFromCode(code: string, fallbackKey: string): string {
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) return digit[1];
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  return KEY_MAP[fallbackKey] ?? (fallbackKey.length === 1 ? fallbackKey.toUpperCase() : fallbackKey);
}

function buildAccelerator(e: React.KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("CmdOrCtrl");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");
  if (e.metaKey && !e.ctrlKey) parts.push("CmdOrCtrl");
  if (!MODIFIER_KEYS.has(e.key)) {
    parts.push(baseKeyFromCode(e.code, e.key));
  }
  return parts.join("+");
}

function ShortcutRow({
  label,
  description,
  value,
  failed,
  onSave,
}: {
  label: string;
  description?: string;
  value: string;
  failed?: boolean;
  onSave: (v: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  function startRecording() {
    setRecording(true);
    btnRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(false);
      return;
    }
    const acc = buildAccelerator(e);
    if (acc && !MODIFIER_KEYS.has(e.key)) {
      onSave(acc);
      setRecording(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {failed && (
          <AlertTriangle size={14} className="text-amber-400 shrink-0" aria-label="Falha ao registrar atalho" />
        )}
        {value && !recording && (
          <span className={`font-mono text-xs bg-gray-800 border px-2 py-1 rounded ${failed ? "border-amber-600 text-amber-300" : "border-gray-700 text-gray-300"}`}>
            {value}
          </span>
        )}
        <button
          ref={btnRef}
          onClick={startRecording}
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
          className={`px-3 py-1.5 text-xs rounded border transition-colors focus:outline-none ${
            recording
              ? "bg-blue-900/40 border-blue-500 text-blue-300 animate-pulse"
              : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500"
          }`}
        >
          {recording ? "Pressione a combinação…" : value ? "Alterar" : "Gravar"}
        </button>
        {value && !recording && (
          <button
            onClick={() => onSave("")}
            className="text-xs text-gray-600 hover:text-red-400 transition-colors"
            title="Remover atalho"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

function SelectRow({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function UpdaterSection() {
  const { state, check, downloadAndInstall, relaunch } = useUpdater();
  const [appVersion, setAppVersion] = useState<string>("");

  useEffect(() => {
    getVersion().then(setAppVersion);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Versão atual: {appVersion}</p>
      </div>

      {state.status === "idle" && (
        <button
          onClick={check}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-gray-500 transition-colors"
        >
          <RefreshCw size={14} />
          Verificar atualizações
        </button>
      )}

      {state.status === "checking" && (
        <p className="text-sm text-gray-400 flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" />
          Verificando…
        </p>
      )}

      {state.status === "available" && (
        <div className="space-y-2">
          <p className="text-sm text-violet-300 flex items-center gap-2">
            <Download size={14} />
            DeskClock {state.version} disponível
          </p>
          {state.body && (
            <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 whitespace-pre-wrap">
              {state.body}
            </p>
          )}
          <button
            onClick={downloadAndInstall}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-sm text-white transition-colors"
          >
            <Download size={14} />
            Baixar e instalar
          </button>
        </div>
      )}

      {state.status === "downloading" && (
        <div className="space-y-2">
          <p className="text-sm text-gray-300">Baixando…</p>
          <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
            <div
              className="bg-violet-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${state.progress ?? 0}%` }}
            />
          </div>
          {state.progress != null && (
            <p className="text-xs text-gray-500 tabular-nums">{state.progress}%</p>
          )}
        </div>
      )}

      {state.status === "ready" && (
        <div className="space-y-2">
          <p className="text-sm text-green-300 flex items-center gap-2">
            <CheckCircle2 size={14} />
            Pronto para instalar
          </p>
          <button
            onClick={relaunch}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-700 hover:bg-green-600 text-sm text-white transition-colors"
          >
            <RotateCcw size={14} />
            Reiniciar agora
          </button>
        </div>
      )}

      {state.status === "error" && (
        <div className="space-y-2">
          <p className="text-sm text-red-400 flex items-center gap-2">
            <AlertCircle size={14} />
            Falha ao verificar
          </p>
          {state.error && (
            <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2 break-all">
              {state.error}
            </p>
          )}
          <button
            onClick={check}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:border-gray-500 transition-colors"
          >
            <RefreshCw size={14} />
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}

type SettingsTab = "geral" | "atalhos" | "aparencia" | "overlay" | "atualizacoes";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "atalhos", label: "Atalhos" },
  { id: "aparencia", label: "Aparência" },
  { id: "overlay", label: "Overlay" },
  { id: "atualizacoes", label: "Atualizações" },
];

function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
      {children}
    </div>
  );
}

function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}

export function SettingsPage() {
  const config = useAppConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");

  // Estado local para evitar escrita a cada keystroke no input de nome
  const [userName, setUserName] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [liveTrayTimer, setLiveTrayTimer] = useState(false);
  const [closeOnFocusLoss, setCloseOnFocusLoss] = useState(false);
  const [discardTasksUnderOneMinute, setDiscardTasksUnderOneMinute] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [fontSize, setFontSize] = useState<"P" | "M" | "G" | "GG">("M");
  const [theme, setTheme] = useState<Theme>("azul");
  const [shortcutToggleTask, setShortcutToggleTask] = useState("");
  const [shortcutStopTask, setShortcutStopTask] = useState("");
  const [shortcutToggleOverlay, setShortcutToggleOverlay] = useState("");
  const [shortcutToggleWindow, setShortcutToggleWindow] = useState("");
  const [shortcutCommandPalette, setShortcutCommandPalette] = useState("CmdOrCtrl+K");
  const [displayServer, setDisplayServer] = useState("");
  const [failedShortcuts, setFailedShortcuts] = useState<string[]>([]);

  // Carrega valores do config quando pronto
  useEffect(() => {
    if (!config.isLoaded) return;
    setUserName(config.get("userName"));
    setShowWelcome(config.get("showWelcomeMessage"));
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySnapToGrid(config.get("overlaySnapToGrid"));
    setLiveTrayTimer(config.get("liveTrayTimer"));
    setCloseOnFocusLoss(config.get("closeOnFocusLoss"));
    setDiscardTasksUnderOneMinute(config.get("discardTasksUnderOneMinute"));
    setFontSize(config.get("fontSize"));
    setTheme(config.get("theme") as Theme);
    setShortcutToggleTask(config.get("shortcutToggleTask"));
    setShortcutStopTask(config.get("shortcutStopTask"));
    setShortcutToggleOverlay(config.get("shortcutToggleOverlay"));
    setShortcutToggleWindow(config.get("shortcutToggleWindow"));
    setShortcutCommandPalette(config.get("shortcutCommandPalette"));
    // Lê estado real do autostart do SO
    isEnabled()
      .then(setStartOnBoot)
      .catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    invoke<string>("get_display_server")
      .then(setDisplayServer)
      .catch(() => {});
  }, []);

  async function handleTheme(value: string) {
    const t = value as Theme;
    setTheme(t);
    applyTheme(t);
    await config.set("theme", t);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "theme",
      value: t,
    } satisfies OverlayConfigChangedPayload);
  }

  async function handleFontSize(value: string) {
    const size = value as "P" | "M" | "G" | "GG";
    setFontSize(size);
    applyFontSize(size);
    await config.set("fontSize", size);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "fontSize",
      value: size,
    } satisfies OverlayConfigChangedPayload);
  }

  async function applyShortcuts(
    overrides?: Partial<{
      toggleTask: string;
      stopTask: string;
      toggleOverlay: string;
      toggleWindow: string;
      commandPalette: string;
    }>
  ) {
    const t = overrides?.toggleTask ?? shortcutToggleTask;
    const s = overrides?.stopTask ?? shortcutStopTask;
    const o = overrides?.toggleOverlay ?? shortcutToggleOverlay;
    const w = overrides?.toggleWindow ?? shortcutToggleWindow;
    const cp = overrides?.commandPalette ?? shortcutCommandPalette;
    await config.set("shortcutToggleTask", t);
    await config.set("shortcutStopTask", s);
    await config.set("shortcutToggleOverlay", o);
    await config.set("shortcutToggleWindow", w);
    await config.set("shortcutCommandPalette", cp);
    const failed = await invoke<string[]>("update_shortcuts", {
      shortcuts: [
        { action: "toggle-task", accelerator: t },
        { action: "stop-task", accelerator: s },
        { action: "toggle-overlay", accelerator: o },
        { action: "toggle-window", accelerator: w },
        { action: "toggle-command-palette", accelerator: cp },
      ],
    });
    setFailedShortcuts(failed);
  }

  async function handleToggle(
    key: "showWelcomeMessage" | "overlaySnapToGrid" | "liveTrayTimer" | "closeOnFocusLoss" | "discardTasksUnderOneMinute",
    setter: (v: boolean) => void,
    value: boolean
  ) {
    setter(value);
    await config.set(key, value);
  }

  async function handleStartOnBoot(value: boolean) {
    setStartOnBoot(value);
    await config.set("startOnBoot", value);
    if (value) {
      await enable();
    } else {
      await disable();
    }
  }

  async function handleSlider(key: "overlayOpacity", setter: (v: number) => void, value: number) {
    setter(value);
    await config.set(key, value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key,
      value,
    } satisfies OverlayConfigChangedPayload);
  }

  // Salva nome com debounce ao perder foco
  async function handleUserNameBlur() {
    await config.set("userName", userName);
  }

  if (!config.isLoaded) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Carregando…
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-100 mb-6">Configurações</h1>

        {/* Pills navigation */}
        <div className="flex gap-1.5 flex-wrap mb-6">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Geral */}
        {activeTab === "geral" && (
          <div className="space-y-4">
            {/* Profile card */}
            <div className="flex items-center gap-4 p-4 bg-gray-900 border border-gray-800 rounded-xl">
              <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-lg font-semibold flex-shrink-0 select-none">
                {userName ? userName[0].toUpperCase() : "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Como quer ser chamado?</p>
                <input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onBlur={handleUserNameBlur}
                  placeholder="Seu nome"
                  className="w-full bg-transparent text-sm font-medium text-gray-100 placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            <SettingsCard>
              <CardRow>
                <ToggleRow
                  label="Abrir acesso rápido ao iniciar"
                  description="Exibe o painel de ações ao abrir o app. Use Ctrl+K para abrí-lo a qualquer momento."
                  value={showWelcome}
                  onChange={(v) => handleToggle("showWelcomeMessage", setShowWelcome, v)}
                />
              </CardRow>
              <CardRow>
                <ToggleRow
                  label="Iniciar na inicialização do computador"
                  description="Abre o DeskClock automaticamente ao ligar o computador"
                  value={startOnBoot}
                  onChange={handleStartOnBoot}
                />
              </CardRow>
              <CardRow>
                <ToggleRow
                  label="Timer ao vivo no ícone da bandeja"
                  description="Mostra o tempo da tarefa em execução no tooltip do ícone"
                  value={liveTrayTimer}
                  onChange={(v) => handleToggle("liveTrayTimer", setLiveTrayTimer, v)}
                />
              </CardRow>
              <CardRow>
                <ToggleRow
                  label="Fechar ao perder foco"
                  description="Oculta a janela automaticamente ao clicar fora dela. Use o pin na barra de título para fixá-la temporariamente."
                  value={closeOnFocusLoss}
                  onChange={(v) => handleToggle("closeOnFocusLoss", setCloseOnFocusLoss, v)}
                />
              </CardRow>
              <CardRow>
                <ToggleRow
                  label="Descartar tarefas com menos de 1 minuto"
                  description="Ao parar uma tarefa com duração inferior a 1 minuto, ela é descartada automaticamente."
                  value={discardTasksUnderOneMinute}
                  onChange={(v) => handleToggle("discardTasksUnderOneMinute", setDiscardTasksUnderOneMinute, v)}
                />
              </CardRow>
            </SettingsCard>
          </div>
        )}

        {/* Atalhos */}
        {activeTab === "atalhos" && (
          <div className="space-y-4">
            {displayServer === "wayland" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-950/40 border border-amber-800/50 px-3 py-2.5">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  Atalhos globais usam XGrabKey e não funcionam no Wayland. Execute o app em XWayland ou mude para uma sessão X11 para usar este recurso.
                </p>
              </div>
            )}
            {failedShortcuts.length > 0 && displayServer !== "wayland" && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-950/40 border border-amber-800/50 px-3 py-2.5">
                <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-xs text-amber-300">
                  {failedShortcuts.length === 1
                    ? "Um atalho não pôde ser registrado — pode estar em uso por outro aplicativo."
                    : `${failedShortcuts.length} atalhos não puderam ser registrados — podem estar em uso por outro aplicativo.`}
                </p>
              </div>
            )}
            <SettingsCard>
              <CardRow>
                <ShortcutRow
                  label="Acesso rápido (Command Palette)"
                  description="Abre o painel de ações de qualquer lugar, mesmo com a janela fechada"
                  value={shortcutCommandPalette}
                  failed={failedShortcuts.includes(shortcutCommandPalette) && !!shortcutCommandPalette}
                  onSave={(v) => { setShortcutCommandPalette(v); applyShortcuts({ commandPalette: v }); }}
                />
              </CardRow>
            </SettingsCard>

            <SettingsCard>
              <CardRow>
                <ShortcutRow
                  label="Iniciar / Pausar / Retomar"
                  description="Alterna execução da tarefa atual"
                  value={shortcutToggleTask}
                  failed={failedShortcuts.includes(shortcutToggleTask) && !!shortcutToggleTask}
                  onSave={(v) => { setShortcutToggleTask(v); applyShortcuts({ toggleTask: v }); }}
                />
              </CardRow>
              <CardRow>
                <ShortcutRow
                  label="Parar"
                  description="Para a tarefa em execução"
                  value={shortcutStopTask}
                  failed={failedShortcuts.includes(shortcutStopTask) && !!shortcutStopTask}
                  onSave={(v) => { setShortcutStopTask(v); applyShortcuts({ stopTask: v }); }}
                />
              </CardRow>
              <CardRow>
                <ShortcutRow
                  label="Mostrar / Ocultar overlay"
                  description="Alterna visibilidade do overlay"
                  value={shortcutToggleOverlay}
                  failed={failedShortcuts.includes(shortcutToggleOverlay) && !!shortcutToggleOverlay}
                  onSave={(v) => { setShortcutToggleOverlay(v); applyShortcuts({ toggleOverlay: v }); }}
                />
              </CardRow>
              <CardRow>
                <ShortcutRow
                  label="Mostrar / Ocultar janela"
                  description="Alterna visibilidade da janela principal"
                  value={shortcutToggleWindow}
                  failed={failedShortcuts.includes(shortcutToggleWindow) && !!shortcutToggleWindow}
                  onSave={(v) => { setShortcutToggleWindow(v); applyShortcuts({ toggleWindow: v }); }}
                />
              </CardRow>
            </SettingsCard>
          </div>
        )}

        {/* Aparência */}
        {activeTab === "aparencia" && (
          <SettingsCard>
            <CardRow>
              <SelectRow
                label="Tema"
                description="Paleta de cores da interface"
                value={theme}
                options={THEMES.map((t) => ({
                  value: t,
                  label: t.charAt(0).toUpperCase() + t.slice(1),
                }))}
                onChange={handleTheme}
              />
            </CardRow>
            <CardRow>
              <SelectRow
                label="Tamanho da fonte"
                description="Escala o texto em toda a interface"
                value={fontSize}
                options={[
                  { value: "P", label: "P — Pequeno" },
                  { value: "M", label: "M — Médio (padrão)" },
                  { value: "G", label: "G — Grande" },
                  { value: "GG", label: "GG — Extra grande" },
                ]}
                onChange={handleFontSize}
              />
            </CardRow>
          </SettingsCard>
        )}

        {/* Overlay */}
        {activeTab === "overlay" && (
          <SettingsCard>
            <CardRow>
              <SliderRow
                label="Opacidade em repouso"
                description="Opacidade quando o cursor não está sobre o overlay"
                value={overlayOpacity}
                min={20}
                max={100}
                unit="%"
                onChange={(v) => handleSlider("overlayOpacity", setOverlayOpacity, v)}
              />
            </CardRow>
            <CardRow>
              <ToggleRow
                label="Snap to grid"
                description={
                  displayServer === "wayland"
                    ? "Não disponível no Wayland — o compositor controla o posicionamento das janelas"
                    : "Encaixa o overlay em grade ao soltar o arraste"
                }
                value={overlaySnapToGrid}
                onChange={(v) => handleToggle("overlaySnapToGrid", setOverlaySnapToGrid, v)}
              />
            </CardRow>
          </SettingsCard>
        )}

        {/* Atualizações */}
        {activeTab === "atualizacoes" && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <UpdaterSection />
          </div>
        )}
      </div>
    </div>
  );
}
