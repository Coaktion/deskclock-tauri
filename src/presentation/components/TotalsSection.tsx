import { formatHHMMSS, formatWeekTotal } from "@shared/utils/time";

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
  return (
    <section className="flex gap-4">
      <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Billable hoje</p>
        <p className="text-sm font-mono text-blue-400">{formatHHMMSS(billableSeconds)}</p>
      </div>
      <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Non-billable hoje</p>
        <p className="text-sm font-mono text-gray-300">{formatHHMMSS(nonBillableSeconds)}</p>
      </div>
      <div className="flex-1 bg-gray-900 border border-gray-700 rounded-lg p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">Semana</p>
        <p className="text-sm font-mono text-gray-300">{formatWeekTotal(weekSeconds, weekDays)}</p>
      </div>
    </section>
  );
}
