import { type Page } from "@presentation/components/Sidebar";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
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
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-100">Integrações</h1>
          <p className="text-xs text-gray-500 mt-1">
            Conecte o DeskClock a ferramentas externas para exportar e importar dados
            automaticamente.
          </p>
        </div>

        <div className="space-y-3">
          <GoogleTile onClick={() => setDetail("google")} />
          <ClockifyTile onClick={() => setDetail("clockify")} />
          <ZendeskTile onClick={() => setDetail("zendesk")} />
        </div>
      </div>
    </div>
  );
}
