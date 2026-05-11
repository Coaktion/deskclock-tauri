import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { createRetroactiveTask } from "@domain/usecases/tasks/CreateRetroactiveTask";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import {
  addDaysISO,
  computeDurationHHMM,
  computeEndHHMM,
  formatHHMM,
  parseDurationInput,
} from "@shared/utils/time";
import { useRef, useState } from "react";

const DEFAULT_DURATION_SECS = 3600;

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function buildISO(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(dateISO + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

function isoToHHMM(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface UseRetroactiveFormOptions {
  selectedDate: string;
  projects: Project[];
  categories: Category[];
  onTaskAdded: () => Promise<void>;
}

export function useRetroactiveForm({
  selectedDate,
  projects,
  categories,
  onTaskAdded,
}: UseRetroactiveFormOptions) {
  const { taskRepo } = useRepositories();
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [billable, setBillable] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState(nowHHMM);
  const [endTime, setEndTime] = useState(() => computeEndHHMM(nowHHMM(), DEFAULT_DURATION_SECS));
  const [durationInput, setDurationInput] = useState("01:00");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const prevStart = useRef(startTime);
  const prevEnd = useRef(endTime);

  function handleStartChange(val: string) {
    setStartTime(val);
    if (val) {
      prevStart.current = val;
      setDurationInput(computeDurationHHMM(val, prevEnd.current));
    }
    setError("");
  }

  function handleStartCommit(val: string) {
    if (!val) setStartTime(prevStart.current);
  }

  function handleEndChange(val: string) {
    setEndTime(val);
    if (val) {
      prevEnd.current = val;
      setDurationInput(computeDurationHHMM(prevStart.current, val));
    }
    setError("");
  }

  function handleEndCommit(val: string) {
    if (!val) setEndTime(prevEnd.current);
  }

  // Retorna o novo horário de fim se válido, false se inválido/sem alteração
  function commitDuration(): string | false {
    const raw = durationInput.trim();
    if (!raw) {
      setDurationInput(computeDurationHHMM(prevStart.current, prevEnd.current));
      return false;
    }
    const parsed = parseDurationInput(raw);
    if (!parsed || parsed < 60) {
      setDurationInput(computeDurationHHMM(prevStart.current, prevEnd.current));
      return false;
    }
    const newEnd = computeEndHHMM(prevStart.current, parsed);
    setEndTime(newEnd);
    prevEnd.current = newEnd;
    setDurationInput(formatHHMM(parsed));
    return newEnd;
  }

  async function handleAdd(overrideEndHHMM?: string) {
    setError("");
    const st = startTime || prevStart.current;
    const et = overrideEndHHMM ?? (endTime || prevEnd.current);
    const startISO = buildISO(selectedDate, st);
    let endISO = buildISO(selectedDate, et);
    if (new Date(endISO) < new Date(startISO)) {
      endISO = buildISO(addDaysISO(selectedDate, 1), et);
    }
    const durationSeconds = Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 1000
    );
    if (durationSeconds < 60) {
      setError("A duração mínima é 1 minuto.");
      return;
    }

    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;

    setSaving(true);
    await createRetroactiveTask(
      taskRepo,
      {
        name: name.trim() || null,
        projectId: pId,
        categoryId: cId,
        billable,
        startTime: startISO,
        endTime: endISO,
        durationSeconds,
      },
      new Date().toISOString()
    );
    setSaving(false);

    // Encadeia: próximo início = fim anterior, mantém mesma duração
    const nextStart = isoToHHMM(endISO);
    const nextEnd = computeEndHHMM(nextStart, durationSeconds);
    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    setName("");
    setStartTime(nextStart);
    setEndTime(nextEnd);
    prevStart.current = nextStart;
    prevEnd.current = nextEnd;
    setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    nameRef.current?.focus();
    await onTaskAdded();
  }

  function prefill(task: PlannedTask) {
    setName(task.name);
    const project = projects.find((p) => p.id === task.projectId);
    const category = categories.find((c) => c.id === task.categoryId);
    setProjectName(project?.name ?? "");
    setSelectedProjectId(task.projectId);
    setCategoryName(category?.name ?? "");
    setSelectedCategoryId(task.categoryId);
    setBillable(task.billable);
    nameRef.current?.focus();
  }

  function advanceChainStart(newStartHHMM: string) {
    const durSecs = parseDurationInput(durationInput) ?? DEFAULT_DURATION_SECS;
    const newEnd = computeEndHHMM(newStartHHMM, durSecs);
    const h = Math.floor(durSecs / 3600);
    const m = Math.floor((durSecs % 3600) / 60);
    setStartTime(newStartHHMM);
    setEndTime(newEnd);
    prevStart.current = newStartHHMM;
    prevEnd.current = newEnd;
    setDurationInput(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
  }

  return {
    nameRef,
    prevStart,
    prevEnd,
    name,
    setName,
    projectName,
    setProjectName,
    categoryName,
    setCategoryName,
    billable,
    setBillable,
    setSelectedProjectId,
    setSelectedCategoryId,
    startTime,
    endTime,
    durationInput,
    setDurationInput,
    error,
    saving,
    handleStartChange,
    handleStartCommit,
    handleEndChange,
    handleEndCommit,
    commitDuration,
    handleAdd,
    prefill,
    advanceChainStart,
  };
}
