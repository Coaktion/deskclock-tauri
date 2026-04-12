import { useEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme, THEMES } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { useUpdater } from "@presentation/hooks/useUpdater";
import { RefreshCw, Download, RotateCcw, AlertCircle, CheckCircle2 } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

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

function TextRow({
  label,
  description,
  value,
  placeholder,
  onChange,
  onBlur,
}: {
  label: string;
  description?: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-sm text-gray-200">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500"
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
  onSave,
}: {
  label: string;
  description?: string;
  value: string;
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
        {value && !recording && (
          <span className="font-mono text-xs text-gray-300 bg-gray-800 border border-gray-700 px-2 py-1 rounded">
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
  const appVersion = "0.1.0";

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

export function SettingsPage() {
  const config = useAppConfig();

  // Estado local para evitar escrita a cada keystroke no input de nome
  const [userName, setUserName] = useState("");
  const [showWelcome, setShowWelcome] = useState(true);
  const [startOnBoot, setStartOnBoot] = useState(false);
  const [liveTrayTimer, setLiveTrayTimer] = useState(false);
  const [closeOnFocusLoss, setCloseOnFocusLoss] = useState(false);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [fontSize, setFontSize] = useState<"P" | "M" | "G" | "GG">("M");
  const [theme, setTheme] = useState<Theme>("azul");
  const [shortcutToggleTask, setShortcutToggleTask] = useState("");
  const [shortcutStopTask, setShortcutStopTask] = useState("");
  const [shortcutToggleOverlay, setShortcutToggleOverlay] = useState("");
  const [shortcutToggleWindow, setShortcutToggleWindow] = useState("");

  // Carrega valores do config quando pronto
  useEffect(() => {
    if (!config.isLoaded) return;
    setUserName(config.get("userName"));
    setShowWelcome(config.get("showWelcomeMessage"));
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySnapToGrid(config.get("overlaySnapToGrid"));
    setLiveTrayTimer(config.get("liveTrayTimer"));
    setCloseOnFocusLoss(config.get("closeOnFocusLoss"));
    setFontSize(config.get("fontSize"));
    setTheme(config.get("theme") as Theme);
    setShortcutToggleTask(config.get("shortcutToggleTask"));
    setShortcutStopTask(config.get("shortcutStopTask"));
    setShortcutToggleOverlay(config.get("shortcutToggleOverlay"));
    setShortcutToggleWindow(config.get("shortcutToggleWindow"));
    // Lê estado real do autostart do SO
    isEnabled()
      .then(setStartOnBoot)
      .catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

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
    }>
  ) {
    const t = overrides?.toggleTask ?? shortcutToggleTask;
    const s = overrides?.stopTask ?? shortcutStopTask;
    const o = overrides?.toggleOverlay ?? shortcutToggleOverlay;
    const w = overrides?.toggleWindow ?? shortcutToggleWindow;
    await config.set("shortcutToggleTask", t);
    await config.set("shortcutStopTask", s);
    await config.set("shortcutToggleOverlay", o);
    await config.set("shortcutToggleWindow", w);
    await invoke("update_shortcuts", {
      shortcuts: [
        { action: "toggle-task", accelerator: t },
        { action: "stop-task", accelerator: s },
        { action: "toggle-overlay", accelerator: o },
        { action: "toggle-window", accelerator: w },
      ],
    });
  }

  async function handleToggle(
    key: "showWelcomeMessage" | "overlaySnapToGrid" | "liveTrayTimer" | "closeOnFocusLoss",
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
        <h1 className="text-xl font-semibold text-gray-100 mb-8">Configurações</h1>

        <Section title="Geral">
          <TextRow
            label="Como quer ser chamado?"
            description="Nome exibido na mensagem de boas-vindas"
            value={userName}
            placeholder="Seu nome"
            onChange={setUserName}
            onBlur={handleUserNameBlur}
          />
          <ToggleRow
            label="Mostrar mensagem de boas-vindas"
            description="Exibe uma saudação ao abrir o app"
            value={showWelcome}
            onChange={(v) => handleToggle("showWelcomeMessage", setShowWelcome, v)}
          />
          <ToggleRow
            label="Iniciar na inicialização do computador"
            description="Abre o DeskClock automaticamente ao ligar o computador"
            value={startOnBoot}
            onChange={handleStartOnBoot}
          />
          <ToggleRow
            label="Timer ao vivo no ícone da bandeja"
            description="Mostra o tempo da tarefa em execução no tooltip do ícone"
            value={liveTrayTimer}
            onChange={(v) => handleToggle("liveTrayTimer", setLiveTrayTimer, v)}
          />
          <ToggleRow
            label="Fechar ao perder foco"
            description="Oculta a janela automaticamente ao clicar fora dela. Use o pin na barra de título para fixá-la temporariamente."
            value={closeOnFocusLoss}
            onChange={(v) => handleToggle("closeOnFocusLoss", setCloseOnFocusLoss, v)}
          />
        </Section>

        <Section title="Atualizações">
          <UpdaterSection />
        </Section>

        <Section title="Overlay">
          <SliderRow
            label="Opacidade em repouso"
            description="Opacidade quando o cursor não está sobre o overlay"
            value={overlayOpacity}
            min={20}
            max={100}
            unit="%"
            onChange={(v) => handleSlider("overlayOpacity", setOverlayOpacity, v)}
          />
          <ToggleRow
            label="Snap to grid"
            description="Encaixa o overlay em grade ao soltar o arraste"
            value={overlaySnapToGrid}
            onChange={(v) => handleToggle("overlaySnapToGrid", setOverlaySnapToGrid, v)}
          />
        </Section>

        <Section title="Acessibilidade">
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
        </Section>

        <Section title="Atalhos globais">
          <ShortcutRow
            label="Iniciar / Pausar / Retomar"
            description="Alterna execução da tarefa atual"
            value={shortcutToggleTask}
            onSave={(v) => { setShortcutToggleTask(v); applyShortcuts({ toggleTask: v }); }}
          />
          <ShortcutRow
            label="Parar"
            description="Para a tarefa em execução"
            value={shortcutStopTask}
            onSave={(v) => { setShortcutStopTask(v); applyShortcuts({ stopTask: v }); }}
          />
          <ShortcutRow
            label="Mostrar / Ocultar overlay"
            description="Alterna visibilidade do overlay"
            value={shortcutToggleOverlay}
            onSave={(v) => { setShortcutToggleOverlay(v); applyShortcuts({ toggleOverlay: v }); }}
          />
          <ShortcutRow
            label="Mostrar / Ocultar janela"
            description="Alterna visibilidade da janela principal"
            value={shortcutToggleWindow}
            onSave={(v) => { setShortcutToggleWindow(v); applyShortcuts({ toggleWindow: v }); }}
          />
        </Section>
      </div>
    </div>
  );
}
