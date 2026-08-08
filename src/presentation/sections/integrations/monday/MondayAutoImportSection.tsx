import { useEffect, useState } from "react";
import { DownloadCloud, RefreshCw } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useSyncNowButton, type SyncFeedback } from "@presentation/hooks/useSyncNowButton";
import { OVERLAY_EVENTS, type MondayImportSyncResultPayload } from "@shared/types/overlayEvents";
import { Row, SubSection, SyncFeedbackLine, Toggle } from "../shared";

/** Payload do rastreador → frase mostrada abaixo do botão. */
export function describeSyncResult(payload: MondayImportSyncResultPayload): SyncFeedback {
  if (!payload.ok) {
    return {
      ok: false,
      text: payload.error || "Erro ao buscar itens.",
      detail: payload.errorDetail,
    };
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
  // Quem busca é o `useMondayItemTracker`, na janela principal; o fim da busca
  // chega por evento, e o watchdog do hook cobre o rastreador que não responde.
  const { searching, feedback, trigger } = useSyncNowButton<MondayImportSyncResultPayload>(
    OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_NOW,
    OVERLAY_EVENTS.MONDAY_IMPORT_SYNC_RESULT,
    describeSyncResult
  );

  useEffect(() => {
    if (!config.isLoaded) return;
    setEnabled(config.get("mondayAutoImportEnabled"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <SubSection
      icon={<DownloadCloud size={15} />}
      title="Importação automática de itens"
      badge={
        enabled ? <span className="ml-1 text-xs text-blue-400 font-medium">Ativa</span> : undefined
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
      <p className="text-xs text-gray-500 leading-relaxed py-2.5">
        Ao abrir o app e a cada 4 horas, importa as suas tarefas da semana nos boards vinculados
        como planejadas — para trazer alguma novidade na hora, use &quot;Buscar itens agora&quot;.
        Item já importado não vira tarefa de novo: o que mudar no Monday é atualizado aqui,
        preservando as suas edições, e o que sair de lá some daqui se nunca tiver sido concluído.
      </p>
      {enabled && (
        <div className="pb-2.5">
          <button
            onClick={trigger}
            disabled={searching}
            className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 px-3 py-1.5 rounded transition-colors border border-gray-700"
          >
            <RefreshCw size={12} className={searching ? "animate-spin" : ""} />
            {searching ? "Buscando…" : "Buscar itens agora"}
          </button>
          {feedback && !searching && <SyncFeedbackLine feedback={feedback} />}
        </div>
      )}
    </SubSection>
  );
}
