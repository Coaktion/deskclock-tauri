import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme, THEMES } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";

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
          {value}{unit}
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
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function ComingSoonSection({ title }: { title: string }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
        {title}
      </h2>
      <p className="text-xs text-gray-600 italic">Em breve</p>
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
  const [overlayAlwaysVisible, setOverlayAlwaysVisible] = useState(true);
  const [overlayShowOnStart, setOverlayShowOnStart] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [overlayShowGridIndicator, setOverlayShowGridIndicator] = useState(false);
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
    setOverlayAlwaysVisible(config.get("overlayAlwaysVisible"));
    setOverlayShowOnStart(config.get("overlayShowOnStart"));
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySnapToGrid(config.get("overlaySnapToGrid"));
    setOverlayShowGridIndicator(config.get("overlayShowGridIndicator"));
    setLiveTrayTimer(config.get("liveTrayTimer"));
    setFontSize(config.get("fontSize"));
    setTheme(config.get("theme") as Theme);
    setShortcutToggleTask(config.get("shortcutToggleTask"));
    setShortcutStopTask(config.get("shortcutStopTask"));
    setShortcutToggleOverlay(config.get("shortcutToggleOverlay"));
    setShortcutToggleWindow(config.get("shortcutToggleWindow"));
    // Lê estado real do autostart do SO
    isEnabled().then(setStartOnBoot).catch(() => {});
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTheme(value: string) {
    const t = value as Theme;
    setTheme(t);
    applyTheme(t);
    await config.set("theme", t);
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

  async function applyShortcuts(overrides?: Partial<{
    toggleTask: string; stopTask: string; toggleOverlay: string; toggleWindow: string;
  }>) {
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
    key: "showWelcomeMessage" | "overlayAlwaysVisible" | "overlayShowOnStart" | "overlaySnapToGrid" | "overlayShowGridIndicator" | "liveTrayTimer",
    setter: (v: boolean) => void,
    value: boolean,
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

  async function handleSlider(
    key: "overlayOpacity",
    setter: (v: number) => void,
    value: number,
  ) {
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
        </Section>

        <Section title="Overlay">
          <ToggleRow
            label="Sempre visível"
            description="Overlay permanece visível após concluir uma tarefa"
            value={overlayAlwaysVisible}
            onChange={(v) => handleToggle("overlayAlwaysVisible", setOverlayAlwaysVisible, v)}
          />
          <ToggleRow
            label="Mostrar ao iniciar tarefa"
            description="Execution overlay aparece automaticamente ao iniciar"
            value={overlayShowOnStart}
            onChange={(v) => handleToggle("overlayShowOnStart", setOverlayShowOnStart, v)}
          />
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
          <ToggleRow
            label="Mostrar indicador visual da grade"
            description="Exibe a grade enquanto arrasta o overlay"
            value={overlayShowGridIndicator}
            onChange={(v) =>
              handleToggle("overlayShowGridIndicator", setOverlayShowGridIndicator, v)
            }
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
          <p className="text-xs text-gray-500 -mt-2 mb-2">
            Use o formato do Tauri: <span className="font-mono text-gray-400">CmdOrCtrl+Shift+T</span>, <span className="font-mono text-gray-400">Alt+F1</span>, etc. Deixe em branco para desativar.
          </p>
          <TextRow
            label="Iniciar / Pausar / Retomar"
            description="Alterna execução da tarefa atual"
            value={shortcutToggleTask}
            placeholder="Ex: CmdOrCtrl+Shift+Space"
            onChange={setShortcutToggleTask}
            onBlur={() => applyShortcuts({ toggleTask: shortcutToggleTask })}
          />
          <TextRow
            label="Parar"
            description="Para a tarefa em execução"
            value={shortcutStopTask}
            placeholder="Ex: CmdOrCtrl+Shift+S"
            onChange={setShortcutStopTask}
            onBlur={() => applyShortcuts({ stopTask: shortcutStopTask })}
          />
          <TextRow
            label="Mostrar / Ocultar overlay"
            description="Alterna visibilidade do overlay"
            value={shortcutToggleOverlay}
            placeholder="Ex: CmdOrCtrl+Shift+O"
            onChange={setShortcutToggleOverlay}
            onBlur={() => applyShortcuts({ toggleOverlay: shortcutToggleOverlay })}
          />
          <TextRow
            label="Mostrar / Ocultar janela"
            description="Alterna visibilidade da janela principal"
            value={shortcutToggleWindow}
            placeholder="Ex: CmdOrCtrl+Shift+W"
            onChange={setShortcutToggleWindow}
            onBlur={() => applyShortcuts({ toggleWindow: shortcutToggleWindow })}
          />
        </Section>

        <ComingSoonSection title="Integrações" />
      </div>
    </div>
  );
}
