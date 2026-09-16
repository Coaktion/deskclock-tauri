import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { useTour } from "@presentation/hooks/useTour";
import { Button, PageHeader } from "@presentation/components/ui";
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
import {
  MondayIntegrationCard,
  MondayTile,
} from "@presentation/sections/integrations/MondayIntegrationSection";
import {
  LlmIntegrationCard,
  LlmTile,
} from "@presentation/sections/integrations/LlmIntegrationSection";

/* ── Page ── */

type IntegrationDetail = "google" | "clockify" | "zendesk" | "monday" | "llm" | null;

export function IntegrationsPage() {
  const [detail, setDetail] = useState<IntegrationDetail>(null);
  const { startTour, hasSeenTour } = useTour("integrations");

  useEffect(() => {
    if (!hasSeenTour) {
      const t = setTimeout(() => startTour(), 400);
      return () => clearTimeout(t);
    }
  }, [hasSeenTour]); // eslint-disable-line react-hooks/exhaustive-deps

  const backButton = (
    <Button
      variant="ghost"
      onClick={() => setDetail(null)}
      icon={<ArrowLeft size={14} />}
      className="mb-5"
    >
      Integrações
    </Button>
  );

  if (detail) {
    return (
      <div className="h-full flex flex-col">
        <PageHeader title="Integrações" />
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <div className="max-w-[720px] mx-auto">
            {backButton}
            {detail === "google" && <GoogleIntegrationCard />}
            {detail === "clockify" && <ClockifyIntegrationCard />}
            {detail === "zendesk" && <ZendeskIntegrationCard />}
            {detail === "monday" && <MondayIntegrationCard />}
            {detail === "llm" && <LlmIntegrationCard />}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Integrações"
        subtitle="Conecte o DeskClock a ferramentas externas para exportar e importar dados."
        onStartTour={startTour}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <div className="max-w-[720px] mx-auto">
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
            <div data-tour="integrations-monday-tile">
              <MondayTile onClick={() => setDetail("monday")} />
            </div>
            <div data-tour="integrations-llm-tile">
              <LlmTile onClick={() => setDetail("llm")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
