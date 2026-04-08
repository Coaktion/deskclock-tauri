import { useState } from "react";
import { TodayPlanningView } from "@presentation/components/TodayPlanningView";
import { WeekPlanningView } from "@presentation/components/WeekPlanningView";

type Tab = "today" | "week";

export function PlanningPage() {
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-gray-700 px-5 pt-4">
        <button
          onClick={() => setTab("today")}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === "today"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Hoje
        </button>
        <button
          onClick={() => setTab("week")}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${
            tab === "week"
              ? "border-blue-500 text-blue-400"
              : "border-transparent text-gray-400 hover:text-gray-200"
          }`}
        >
          Semana
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === "today" ? <TodayPlanningView /> : <WeekPlanningView />}
      </div>
    </div>
  );
}
