import { useState, useEffect } from "react";
import type { Task } from "@domain/entities/Task";
import { effectiveDuration } from "@domain/usecases/tasks/_helpers";

export function useTaskTimer(task: Task | null): number {
  const [seconds, setSeconds] = useState(() =>
    task ? effectiveDuration(task, new Date().toISOString()) : 0
  );

  useEffect(() => {
    if (!task) {
      setSeconds(0);
      return;
    }
    setSeconds(effectiveDuration(task, new Date().toISOString()));
    if (task.status !== "running") return;
    const id = setInterval(() => {
      setSeconds(effectiveDuration(task, new Date().toISOString()));
    }, 1000);
    return () => clearInterval(id);
  }, [task]);

  return seconds;
}
