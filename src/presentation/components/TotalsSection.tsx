import { formatHHMMSS, formatWeekTotal } from "@shared/utils/time";

interface TotalsSectionProps {
  billableSeconds: number;
  nonBillableSeconds: number;
  weekSeconds: number;
  weekDays: number;
}

interface KpiCardProps {
  label: string;
  value: string;
  barColor: string;
  barPct: number;
  hint?: string;
  valueColor?: string;
}

function KpiCard({ label, value, barColor, barPct, hint, valueColor = "text-gray-100" }: KpiCardProps) {
  const pct = Math.min(100, Math.max(0, barPct));
  return (
    <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-3 flex flex-col gap-1 min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </div>
      <div className={`font-mono text-[17px] font-medium tracking-tight ${valueColor}`}>
        {value}
      </div>
      <div className="h-[3px] bg-gray-800 rounded-full overflow-hidden mt-1">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hint && (
        <div className="text-[10.5px] text-gray-500 mt-0.5">{hint}</div>
      )}
    </div>
  );
}

export function TotalsSection({
  billableSeconds,
  nonBillableSeconds,
  weekSeconds,
  weekDays,
}: TotalsSectionProps) {
  const totalToday = billableSeconds + nonBillableSeconds;

  // Billable: ratio vs total today (fallback: vs 6h target)
  const billablePct =
    totalToday > 0
      ? (billableSeconds / totalToday) * 100
      : (billableSeconds / (6 * 3600)) * 100;

  // Non-billable: ratio vs total today (fallback: vs 6h target)
  const nonBillablePct =
    totalToday > 0
      ? (nonBillableSeconds / totalToday) * 100
      : (nonBillableSeconds / (6 * 3600)) * 100;

  // Total hoje: vs 8h workday target
  const todayPct = (totalToday / (8 * 3600)) * 100;

  // Semana: vs 40h weekly target
  const weekPct = (weekSeconds / (40 * 3600)) * 100;

  return (
    <section className="flex gap-3">
      <KpiCard
        label="Billable hoje"
        value={formatHHMMSS(billableSeconds)}
        barColor="bg-emerald-500"
        barPct={billablePct}
        valueColor="text-emerald-400"
        hint={totalToday > 0 ? `${Math.round(billablePct)}% do total` : undefined}
      />
      <KpiCard
        label="Non-billable"
        value={formatHHMMSS(nonBillableSeconds)}
        barColor="bg-gray-500"
        barPct={nonBillablePct}
        hint={totalToday > 0 ? `${Math.round(nonBillablePct)}% do total` : undefined}
      />
      <KpiCard
        label="Total hoje"
        value={formatHHMMSS(totalToday)}
        barColor="bg-blue-500"
        barPct={todayPct}
        hint={`meta 8h`}
      />
      <KpiCard
        label="Semana"
        value={formatWeekTotal(weekSeconds, weekDays)}
        barColor="bg-blue-500"
        barPct={weekPct}
        hint={`meta 40h`}
      />
    </section>
  );
}
