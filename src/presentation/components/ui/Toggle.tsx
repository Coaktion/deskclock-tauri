import { SettingLabel } from "./SettingLabel";

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Presente, desenha a linha inteira: rótulo à esquerda, chave à direita. */
  label?: string;
  description?: string;
  /** Obrigatório sem `label` — sem um dos dois a chave é anunciada vazia. */
  ariaLabel?: string;
}

export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  description,
  ariaLabel,
}: ToggleProps) {
  const knob = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
        disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
      } ${checked ? "bg-accent" : "bg-border"}`}
    >
      {/* `bg-fg`, não branco: no modo claro o trilho desligado é claro e um
          knob branco some nele. */}
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-fg rounded-full shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );

  if (!label) return knob;

  return (
    <div className="flex items-center justify-between gap-4">
      <SettingLabel label={label} description={description} disabled={disabled} />
      {knob}
    </div>
  );
}
