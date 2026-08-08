import { useState } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { GeralTab } from "@presentation/sections/settings/GeralTab";
import { AtalhosTab } from "@presentation/sections/settings/AtalhosTab";
import { AparenciaTab } from "@presentation/sections/settings/AparenciaTab";
import { OverlayTab } from "@presentation/sections/settings/OverlayTab";
import { ApiTab } from "@presentation/sections/settings/ApiTab";
import { AtualizacoesTab } from "@presentation/sections/settings/AtualizacoesTab";
import { FilterPill, PageHeader } from "@presentation/components/ui";
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
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        Carregando…
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Configurações"
        actions={
          <button
            onClick={() => void openInBrowser(MANUAL_URL)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-text bg-accent/10 border border-accent/30 rounded-control hover:bg-accent/20 hover:border-accent/50 transition-colors cursor-pointer"
          >
            <BookOpen size={15} />
            Manual
          </button>
        }
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-6">
          <div className="flex gap-1.5 flex-wrap mb-6">
            {SETTINGS_TABS.map((tab) => (
              <FilterPill
                key={tab.id}
                active={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </FilterPill>
            ))}
          </div>

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
