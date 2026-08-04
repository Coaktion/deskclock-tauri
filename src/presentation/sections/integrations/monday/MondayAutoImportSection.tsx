import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, DownloadCloud, RefreshCw } from "lucide-react";
import { emit, listen } from "@tauri-apps/api/event";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type MondayImportSyncResultPayload } from "@shared/types/overlayEvents";
import { Row, SubSection, Toggle } from "../shared";

// Rede lenta com muitos boards leva minutos; o corte existe só para o botão não
// ficar travado para sempre se o rastreador não estiver de pé para responder.
const SYNC_TIMEOUT_MS = 3 * 60 * 1000;

interface SyncFeedback {
  ok: boolean;
  text: string;
}

/** Payload do rastreador → frase mostrada abaixo do botão. */
export function describeSyncResult(payload: MondayImportSyncResultPayload): SyncFeedback {
  if (!payload.ok) {
    return { ok: false, text: payload.error || "Erro ao buscar itens." };
  }
  if (payload.busy) {
    return { ok: true, text: "Uma busca automática já estava em andamento." };
  }
  const { created, updated, removed } = payload;
  if (created + updated + removed === 0) {
    return { ok: true, text: "Busca concluída. Nenhuma novidade nos boards." };
  }
  const partes = [
    created > 0 ? `${created} criada(s)` : null,
    updated > 0 ? `${updated} atualizada(s)` : null,
    removed > 0 ? `${removed} removida(s)` : null,
  ].filter(Boolean);
  return { ok: true, text: `Busca concluída: ${partes.join(", ")}.` };
}

export function MondayAutoImportSection() {
  const config = useAppConfig();
  const [enabled, setEnabled] = useState(false);
  const [searching, setSearching] = useState(false);
  const [feedback, setFeedback] = useState<SyncFeedback | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!config.isLoaded) return;
    setEnabled(config.get("mondayAutoImportEnabled"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Quem busca é o `useMondayItemTracker`, na janela principal; o fim da busca
  // chega por evento. Sem ele o botão só poderia adivinhar a conclusão por tempo.
  useEffect(() => {
    const unlisten = listen<MondayImportSyncResultPayload>(
      OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_RESULT,
      (event) => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setSearching(false);
        setFeedback(describeSyncResult(event.payload));
      }
    );
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      void unlisten.then((fn) => fn());
    };
  }, []);

  async function handleSearchNow() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setFeedback(null);
    setSearching(true);
    timeoutRef.current = setTimeout(() => {
      setSearching(false);
      setFeedback({ ok: false, text: "A busca não respondeu a tempo. Tente novamente." });
    }, SYNC_TIMEOUT_MS);
    await emit(OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_NOW, {});
  }

  return (
    <SubSection
      icon={<DownloadCloud size={15} />}
      title="Importação automática de itens"
      badge={
        enabled ? (
          <span className="ml-1 text-[10.5px] text-blue-400 font-medium">Ativa</span>
        ) : undefined
      }
    >
      <Row label="Ativar">
        <Toggle
          checked={enabled}
          onChange={async (v) => {
            setEnabled(v);
            await config.set("mondayAutoImportEnabled", v);
          }}
        />
      </Row>
      <p className="text-[11px] text-gray-500 leading-relaxed py-2.5">
        Ao abrir o app e a cada 30 minutos, importa as suas tarefas da semana nos boards vinculados
        como planejadas. Item já importado não vira tarefa de novo: o que mudar no Monday é
        atualizado aqui, preservando as suas edições, e o que sair de lá some daqui se nunca tiver
        sido concluído.
      </p>
      {enabled && (
        <div className="pb-2.5">
          <button
            onClick={handleSearchNow}
            disabled={searching}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 px-3 py-1.5 rounded transition-colors border border-gray-700"
          >
            <RefreshCw size={12} className={searching ? "animate-spin" : ""} />
            {searching ? "Buscando…" : "Buscar itens agora"}
          </button>
          {feedback && !searching && (
            <p
              className={`flex items-start gap-1.5 mt-2 text-[11px] leading-relaxed ${
                feedback.ok ? "text-green-400" : "text-rose-400"
              }`}
            >
              {feedback.ok ? (
                <CheckCircle2 size={12} className="mt-px shrink-0" />
              ) : (
                <AlertCircle size={12} className="mt-px shrink-0" />
              )}
              {feedback.text}
            </p>
          )}
        </div>
      )}
    </SubSection>
  );
}
