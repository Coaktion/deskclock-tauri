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
      className={`flex items-center gap-1.5 px-2 py-1 text-sm font-medium rounded-chip border transition-colors ${
        value
          ? "bg-billable/10 border-billable/30 text-billable"
          : "bg-raised border-border text-fg-muted hover:text-fg-secondary"
      }`}
    >
      <DollarSign size={14} />
      {label ?? (value ? "Billable" : "Non-billable")}
    </button>
  );
}
