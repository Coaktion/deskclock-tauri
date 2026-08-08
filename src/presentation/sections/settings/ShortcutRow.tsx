import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";

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
  return (
    KEY_MAP[fallbackKey] ?? (fallbackKey.length === 1 ? fallbackKey.toUpperCase() : fallbackKey)
  );
}

export function buildAccelerator(e: React.KeyboardEvent): string {
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

export function ShortcutRow({
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
        <p className="text-sm text-fg">{label}</p>
        {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {failed && (
          <AlertTriangle
            size={14}
            className="text-amber-400 shrink-0"
            aria-label="Falha ao registrar atalho"
          />
        )}
        {value && !recording && (
          <span
            className={`font-mono text-xs bg-raised border px-2 py-1 rounded-chip ${failed ? "border-amber-600 text-amber-300" : "border-border text-fg-secondary"}`}
          >
            {value}
          </span>
        )}
        <button
          ref={btnRef}
          onClick={startRecording}
          onKeyDown={handleKeyDown}
          onBlur={() => setRecording(false)}
          className={`px-3 py-1.5 text-xs rounded-control border transition-colors focus:outline-none ${
            recording
              ? "bg-accent/15 border-accent text-accent-text animate-pulse"
              : "bg-raised border-border text-fg-muted hover:text-fg hover:border-fg-muted"
          }`}
        >
          {recording ? "Pressione a combinação…" : value ? "Alterar" : "Gravar"}
        </button>
        {value && !recording && (
          <button
            onClick={() => onSave("")}
            className="text-xs text-fg-muted hover:text-danger transition-colors"
            title="Remover atalho"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
