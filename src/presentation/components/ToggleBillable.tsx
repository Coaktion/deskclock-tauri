import { DollarSign } from "lucide-react";

interface ToggleBillableProps {
  value: boolean;
  onChange: (value: boolean) => void;
  label?: string;
}

export function ToggleBillable({ value, onChange, label }: ToggleBillableProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      title={value ? "Billable — clique para alternar" : "Non-billable — clique para alternar"}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded border transition-colors ${
        value
          ? "bg-green-900/40 border-green-700 text-green-400"
          : "bg-gray-800 border-gray-600 text-gray-400 hover:text-gray-300"
      }`}
    >
      <DollarSign size={12} />
      {label ?? (value ? "Billable" : "Non-billable")}
    </button>
  );
}
