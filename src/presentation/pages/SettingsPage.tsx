import { useState } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { GeralTab } from "@presentation/sections/settings/GeralTab";
import { AtalhosTab } from "@presentation/sections/settings/AtalhosTab";
import { AparenciaTab } from "@presentation/sections/settings/AparenciaTab";
import { OverlayTab } from "@presentation/sections/settings/OverlayTab";
import { ApiTab } from "@presentation/sections/settings/ApiTab";
import { AtualizacoesTab } from "@presentation/sections/settings/AtualizacoesTab";
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
    <div className="h-full overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-100">Configurações</h1>
          <button
            onClick={() => void openInBrowser(MANUAL_URL)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/20 hover:border-blue-500/50 hover:text-blue-300 transition-colors cursor-pointer"
          >
            <BookOpen size={15} />
            Manual
          </button>
        </div>

        <div className="flex gap-1.5 flex-wrap mb-6">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                activeTab === tab.id
                  ? "bg-blue-500/10 border-blue-500/40 text-blue-400"
                  : "bg-transparent border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
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
  );
}
