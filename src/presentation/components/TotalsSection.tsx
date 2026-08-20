import { formatHHMMSS, formatWeekTotal } from "@shared/utils/time";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { KpiCard } from "@presentation/components/ui";

interface TotalsSectionProps {
  billableSeconds: number;
  nonBillableSeconds: number;
  weekSeconds: number;
  weekDays: number;
}

export function TotalsSection({
  billableSeconds,
  nonBillableSeconds,
  weekSeconds,
  weekDays,
}: TotalsSectionProps) {
  const config = useAppConfig();
  const dailyGoalSec = (config.isLoaded ? config.get("dailyGoalHours") : 8) * 3600;
  const weeklyGoalSec = (config.isLoaded ? config.get("weeklyGoalHours") : 40) * 3600;

  const totalToday = billableSeconds + nonBillableSeconds;

  // Billable: ratio vs total today (fallback: vs daily goal)
  const billablePct =
    totalToday > 0 ? (billableSeconds / totalToday) * 100 : (billableSeconds / dailyGoalSec) * 100;

  // Non-billable: ratio vs total today (fallback: vs daily goal)
  const nonBillablePct =
    totalToday > 0
      ? (nonBillableSeconds / totalToday) * 100
      : (nonBillableSeconds / dailyGoalSec) * 100;

  const todayPct = (totalToday / dailyGoalSec) * 100;
  const weekPct = (weekSeconds / weeklyGoalSec) * 100;

  const dailyLabel = `meta ${config.isLoaded ? config.get("dailyGoalHours") : 8}h`;
  // Os dias moram na dica, e não colados ao valor — é onde o design os escreve.
  const weeklyLabel = `meta ${config.isLoaded ? config.get("weeklyGoalHours") : 40}h · ${weekDays} ${
    weekDays === 1 ? "dia" : "dias"
  }`;

  return (
    <section className="flex gap-3">
      <KpiCard
        label="Billable hoje"
        value={formatHHMMSS(billableSeconds)}
        tone="billable"
        barPct={billablePct}
        hint={totalToday > 0 ? `${Math.round(billablePct)}% do total` : undefined}
      />
      <KpiCard
        label="Non-billable"
        value={formatHHMMSS(nonBillableSeconds)}
        barTone="muted"
        barPct={nonBillablePct}
        hint={totalToday > 0 ? `${Math.round(nonBillablePct)}% do total` : undefined}
      />
      <KpiCard
        label="Total hoje"
        value={formatHHMMSS(totalToday)}
        barPct={todayPct}
        barTone="accent"
        hint={dailyLabel}
      />
      <KpiCard
        label="Semana"
        value={formatWeekTotal(weekSeconds)}
        barPct={weekPct}
        barTone="accent"
        hint={weeklyLabel}
      />
    </section>
  );
}
