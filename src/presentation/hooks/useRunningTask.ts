import { useContext } from "react";
import { RunningTaskContext } from "@presentation/contexts/RunningTaskContext";
import type { RunningTaskContextValue } from "@presentation/contexts/RunningTaskContext";

export function useRunningTask(): RunningTaskContextValue {
  const ctx = useContext(RunningTaskContext);
  if (!ctx) throw new Error("useRunningTask must be inside RunningTaskProvider");
  return ctx;
}
