import { WeekPlanningView } from "@presentation/components/WeekPlanningView";

export function PlanningPage() {
  return (
    <div className="h-full flex flex-col overflow-y-auto">
      <WeekPlanningView />
    </div>
  );
}
