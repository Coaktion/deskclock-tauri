import { type Page } from "@presentation/components/Sidebar";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTour } from "@presentation/hooks/useTour";
import {
  GoogleIntegrationCard,
  GoogleTile,
} from "@presentation/sections/integrations/GoogleIntegrationSection";
import {
  ClockifyIntegrationCard,
  ClockifyTile,
} from "@presentation/sections/integrations/ClockifyIntegrationSection";
import {
  ZendeskIntegrationCard,
  ZendeskTile,
} from "@presentation/sections/integrations/ZendeskIntegrationSection";

/* ── Page ── */

type IntegrationDetail = "google" | "clockify" | "zendesk" | null;

export function IntegrationsPage({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const [detail, setDetail] = useState<IntegrationDetail>(null);
  const { startTour, hasSeenTour } = useTour("integrations");

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, [hasSeenTour]); // eslint-disable-line react-hooks/exhaustive-deps

  const backButton = (
    <button
      onClick={() => setDetail(null)}
      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors mb-5"
    >
      <ArrowLeft size={12} />
      Integrações
    </button>
  );

  if (detail) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-6 max-w-2xl mx-auto">
          {backButton}
          {detail === "google" && <GoogleIntegrationCard onNavigate={onNavigate} />}
          {detail === "clockify" && <ClockifyIntegrationCard />}
          {detail === "zendesk" && <ZendeskIntegrationCard />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-gray-100">Integrações</h1>
            <p className="text-xs text-gray-500 mt-1">
              Conecte o DeskClock a ferramentas externas para exportar e importar dados
              automaticamente.
            </p>
          </div>
          <button
            onClick={() => startTour()}
            title="Ver tour da página"
            className="w-5 h-5 shrink-0 rounded-full border border-gray-700 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors text-[11px] font-medium flex items-center justify-center mt-1"
          >
            ?
          </button>
        </div>

        <div data-tour="integrations-list" className="space-y-3">
          <div data-tour="integrations-google-tile">
            <GoogleTile onClick={() => setDetail("google")} />
          </div>
          <div data-tour="integrations-clockify-tile">
            <ClockifyTile onClick={() => setDetail("clockify")} />
          </div>
          <div data-tour="integrations-zendesk-tile">
            <ZendeskTile onClick={() => setDetail("zendesk")} />
          </div>
        </div>
      </div>
    </div>
  );
}
