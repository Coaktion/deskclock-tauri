/** Papel do número, não a cor dele — a cor sai do token correspondente. */
export type KpiTone = "default" | "billable" | "accent" | "muted";

const VALUE_TONE: Record<KpiTone, string> = {
  default: "text-fg",
  billable: "text-billable",
  accent: "text-accent-text",
  muted: "text-fg-secondary",
};

const BAR_TONE: Record<KpiTone, string> = {
  default: "bg-fg-muted",
  billable: "bg-billable",
  accent: "bg-accent",
  muted: "bg-fg-muted",
};

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  /** Percentual 0–100. Ausente = trilho vazio, nunca trilho ausente. */
  barPct?: number;
  /** Tom da barra quando ele não acompanha o do valor. */
  barTone?: KpiTone;
}

export function KpiCard({ label, value, hint, tone = "default", barPct, barTone }: KpiCardProps) {
  const pct = barPct === undefined ? undefined : Math.min(100, Math.max(0, barPct));

  return (
    <div className="flex-1 min-w-0 bg-surface border border-border-subtle rounded-card p-3 flex flex-col gap-1">
      <span className="text-overline uppercase text-fg-muted">{label}</span>
      <span
        className={`font-mono text-metric font-medium tracking-tight tabular-nums ${VALUE_TONE[tone]}`}
      >
        {value}
      </span>
      {/* O trilho é desenhado sempre, e é ele que mantém os cartões da mesma
          altura: os quatro do Histórico ficam lado a lado, e dois deles não têm
          percentual nenhum a mostrar. Sem `barPct`, fica vazio. */}
      <div className="h-[3px] bg-raised rounded-full overflow-hidden mt-1">
        {pct !== undefined && (
          <div
            className={`h-full rounded-full transition-all duration-300 ${BAR_TONE[barTone ?? tone]}`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
      {hint && <span className="text-xs text-fg-muted mt-0.5">{hint}</span>}
    </div>
  );
}
