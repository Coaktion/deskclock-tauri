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
      <div className="h-full w-full flex flex-col items-center justify-center gap-4 p-5 text-center bg-gray-900 border border-gray-800 rounded-xl shadow-xl">
        <Icon size={28} className="text-blue-400" />
        <div className="flex flex-col gap-1">
          <p className="text-xs text-gray-400">
            {isStart ? "Reunião começando" : "Reunião terminou"}
          </p>
          <p className="text-sm font-medium text-gray-100 line-clamp-2">{prompt.title}</p>
          <p className="text-xs text-gray-400 mt-1">
            {isStart ? "Deseja iniciar esta tarefa?" : "Ainda está em andamento?"}
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          {isStart ? (
            <>
              <button
                onClick={() => onRespond("start")}
                className="w-full px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Iniciar
              </button>
              <button
                onClick={() => onRespond("snooze")}
                className="w-full px-3 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
              >
                Adiar por 5 min
              </button>
              <button
                onClick={() => onRespond("dismiss")}
                className="w-full px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Dispensar
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onRespond("still-going")}
                className="w-full px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
              >
                Ainda em andamento
              </button>
              <button
                onClick={() => onRespond("stop")}
                className="w-full px-3 py-2 text-sm text-gray-300 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
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
