import { useEffect, useState } from "react";
import { Field, Input, Select, SettingLabel } from "@presentation/components/ui";

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
      <div className="flex items-center justify-between gap-4">
        <SettingLabel label={label} description={description} />
        <span className="text-sm font-mono tabular-nums text-fg-secondary shrink-0">
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
      <SettingLabel label={label} description={description} />
      <Select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="shrink-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

export function NumberInputWithCommit({
  id,
  label,
  min,
  max,
  committed,
  onCommit,
  inputClassName,
}: {
  id?: string;
  /** Ausente, o campo fica sem rótulo próprio: quem o nomeia é a linha em
   *  volta, com o texto à esquerda e o controle à direita (a porta da API). */
  label?: string;
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

  const field = (
    <Input
      id={id}
      type="number"
      variant={label ? "bare" : "boxed"}
      min={min}
      max={max}
      value={input}
      onChange={(e) => setInput(e.target.value)}
      onBlur={handleBlur}
      className={inputClassName ?? "w-full font-mono tabular-nums"}
    />
  );

  return label ? <Field label={label}>{field}</Field> : field;
}
