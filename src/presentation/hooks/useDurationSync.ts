import { useRef, useState } from "react";
import {
  computeDurationHHMM,
  computeEndHHMM,
  formatHHMM,
  parseDurationInput,
} from "@shared/utils/time";

interface UseDurationSyncOptions {
  /** Hora de início inicial no formato HH:MM. */
  initialStart: string;
  /** Hora de fim inicial no formato HH:MM. */
  initialEnd: string;
  /** Duração mínima aceita em `commitDuration` (segundos). Padrão: 60 (1 minuto). */
  minDurationSeconds?: number;
  /** Chamado a cada edição de início/fim — útil para limpar erros no formulário pai. */
  onChange?: () => void;
}

/**
 * Mantém início, fim e duração em sincronia — a fonte única para os três campos
 * de horário compartilhados entre o lançamento retroativo e a edição de tarefa.
 * Editar início/fim recalcula a duração; `commitDuration` recalcula o fim a partir
 * da duração digitada (aceita HH:MM:SS, MM:SS, minutos e linguagem natural via
 * `parseDurationInput`). Overnight é resolvido nos utilitários de `time.ts`.
 */
export function useDurationSync({
  initialStart,
  initialEnd,
  minDurationSeconds = 60,
  onChange,
}: UseDurationSyncOptions) {
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [durationInput, setDurationInput] = useState(() =>
    computeDurationHHMM(initialStart, initialEnd)
  );

  const prevStart = useRef(initialStart);
  const prevEnd = useRef(initialEnd);

  function handleStartChange(val: string) {
    setStartTime(val);
    if (val) {
      prevStart.current = val;
      setDurationInput(computeDurationHHMM(val, prevEnd.current));
    }
    onChange?.();
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
    onChange?.();
  }

  function handleEndCommit(val: string) {
    if (!val) setEndTime(prevEnd.current);
  }

  /** Recalcula o fim a partir da duração digitada. Retorna o novo fim HH:MM ou false se inválido. */
  function commitDuration(): string | false {
    const raw = durationInput.trim();
    if (!raw) {
      setDurationInput(computeDurationHHMM(prevStart.current, prevEnd.current));
      return false;
    }
    const parsed = parseDurationInput(raw);
    if (!parsed || parsed < minDurationSeconds) {
      setDurationInput(computeDurationHHMM(prevStart.current, prevEnd.current));
      return false;
    }
    const newEnd = computeEndHHMM(prevStart.current, parsed);
    setEndTime(newEnd);
    prevEnd.current = newEnd;
    setDurationInput(formatHHMM(parsed));
    return newEnd;
  }

  return {
    startTime,
    setStartTime,
    endTime,
    setEndTime,
    durationInput,
    setDurationInput,
    prevStart,
    prevEnd,
    handleStartChange,
    handleStartCommit,
    handleEndChange,
    handleEndCommit,
    commitDuration,
  };
}
