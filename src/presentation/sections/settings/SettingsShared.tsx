import { useEffect, useState } from "react";

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${disabled ? "text-gray-500" : "text-gray-200"}`}>{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
        } ${value ? "bg-blue-600" : "bg-gray-700"}`}
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
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onBlur={handleBlur}
        className={
          inputClassName ??
          "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-blue-500 transition-colors"
        }
        autoComplete="off"
      />
    </div>
  );
}

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl divide-y divide-gray-800">
      {children}
    </div>
  );
}

export function CardRow({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-3">{children}</div>;
}
