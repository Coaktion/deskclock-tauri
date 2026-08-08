import { CalendarClock, Clock } from "lucide-react";
import type {
  MeetingPromptPayload,
  MeetingPromptResponsePayload,
} from "@shared/types/overlayEvents";

interface MeetingPromptViewProps {
  prompt: MeetingPromptPayload;
  onRespond: (action: MeetingPromptResponsePayload["action"]) => void;
}

/** Prompt exibido no popup quando uma reunião começa (start) ou termina (end). */
export function MeetingPromptView({ prompt, onRespond }: MeetingPromptViewProps) {
  const isStart = prompt.kind === "start";
  const Icon = isStart ? CalendarClock : Clock;

  return (
    <div className="w-screen h-screen p-2">
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-5 text-center bg-surface border border-border-subtle rounded-card shadow-xl">
        <Icon size={28} className="text-accent-text" />
        <div className="flex flex-col gap-1">
          <p className="text-xs text-fg-secondary">
            {isStart ? "Reunião começando" : "Reunião terminou"}
          </p>
          <p className="text-sm font-medium text-fg line-clamp-2">{prompt.title}</p>
          <p className="text-xs text-fg-secondary mt-1">
            {isStart ? "Deseja iniciar esta tarefa?" : "Ainda está em andamento?"}
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          {isStart ? (
            <>
              <button
                onClick={() => onRespond("start")}
                className="w-full px-3 py-2 text-sm font-medium bg-accent hover:opacity-90 text-white rounded-chip transition"
              >
                Iniciar
              </button>
              <button
                onClick={() => onRespond("snooze")}
                className="w-full px-3 py-2 text-sm text-fg-secondary bg-raised hover:bg-border rounded-chip transition-colors"
              >
                Adiar por 5 min
              </button>
              <button
                onClick={() => onRespond("dismiss")}
                className="w-full px-3 py-1.5 text-xs text-fg-muted hover:text-fg-secondary transition-colors"
              >
                Dispensar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onRespond("still-going")}
                className="w-full px-3 py-2 text-sm font-medium bg-accent hover:opacity-90 text-white rounded-chip transition"
              >
                Ainda em andamento
              </button>
              <button
                onClick={() => onRespond("stop")}
                className="w-full px-3 py-2 text-sm text-fg-secondary bg-raised hover:bg-border rounded-chip transition-colors"
              >
                Encerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
