import { useEffect, useState } from "react";

/** Casca de campo autônomo — o `fieldControlClass` é o oposto: sem casca. */
export const settingsInputClass =
  "px-3 py-2 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent transition-colors";

export function SliderRow({
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
          <p className="text-sm text-fg">{label}</p>
          {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
        </div>
        <span className="text-sm font-mono tabular-nums text-fg-secondary">
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
        className="w-full accent-accent"
      />
    </div>
  );
}

export function SelectRow({
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
        <p className="text-sm text-fg">{label}</p>
        {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0 px-3 py-1.5 text-sm bg-raised border border-border rounded-control text-fg focus:outline-none focus:border-accent transition-colors cursor-pointer"
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

export function NumberInputWithCommit({
  label,
  min,
  max,
  committed,
  onCommit,
  inputClassName,
}: {
  label: string;
  min: number;
  max: number;
  committed: number;
  onCommit: (v: number) => void;
  inputClassName?: string;
}) {
  const [input, setInput] = useState(String(committed));

  useEffect(() => {
    setInput(String(committed));
  }, [committed]);

  function handleBlur() {
    const parsed = parseInt(input, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) {
      setInput(String(committed));
      return;
    }
    onCommit(parsed);
  }

  return (
    <div>
      {label && <label className="block text-xs text-fg-muted mb-1.5">{label}</label>}
      <input
        type="number"
        min={min}
        max={max}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={handleBlur}
        className={inputClassName ?? `w-full font-mono tabular-nums ${settingsInputClass}`}
        autoComplete="off"
      />
    </div>
  );
}
