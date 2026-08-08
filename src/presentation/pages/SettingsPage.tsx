import { useState } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { GeralTab } from "@presentation/sections/settings/GeralTab";
import { AtalhosTab } from "@presentation/sections/settings/AtalhosTab";
import { AparenciaTab } from "@presentation/sections/settings/AparenciaTab";
import { OverlayTab } from "@presentation/sections/settings/OverlayTab";
import { ApiTab } from "@presentation/sections/settings/ApiTab";
import { AtualizacoesTab } from "@presentation/sections/settings/AtualizacoesTab";
import { Button, FilterPill, PageHeader } from "@presentation/components/ui";
import { openInBrowser } from "@shared/utils/shell";
import { BookOpen } from "lucide-react";

const MANUAL_URL = "https://coaktion.github.io/deskclock-tauri";

type SettingsTab = "geral" | "atalhos" | "aparencia" | "overlay" | "api" | "atualizacoes";

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: "geral", label: "Geral" },
  { id: "atalhos", label: "Atalhos" },
  { id: "aparencia", label: "Aparência" },
  { id: "overlay", label: "Overlay" },
  { id: "api", label: "API Local" },
  { id: "atualizacoes", label: "Atualizações" },
];

export function SettingsPage() {
  const config = useAppConfig();
  const [activeTab, setActiveTab] = useState<SettingsTab>("geral");

  if (!config.isLoaded) {
    return (
      <div className="flex items-center justify-center h-full text-fg-muted text-sm">
        Carregando…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Configurações"
        tabs={SETTINGS_TABS.map((tab) => (
          <FilterPill
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            size="sm"
          >
            {tab.label}
          </FilterPill>
        ))}
        actions={
          <Button
            variant="accent"
            onClick={() => void openInBrowser(MANUAL_URL)}
            icon={<BookOpen size={14} />}
          >
            Manual
          </Button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-5">
        <div className="max-w-[720px] mx-auto">
          {activeTab === "geral" && <GeralTab />}
          {activeTab === "atalhos" && <AtalhosTab />}
          {activeTab === "aparencia" && <AparenciaTab />}
          {activeTab === "overlay" && <OverlayTab />}
          {activeTab === "api" && <ApiTab />}
          {activeTab === "atualizacoes" && <AtualizacoesTab />}
        </div>
      </div>
    </div>
  );
}
