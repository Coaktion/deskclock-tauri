import { useEffect, useState } from "react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { MODES, ACCENTS, resolveAppearance } from "@shared/utils/theme";
import type { Appearance, Mode, Accent } from "@shared/utils/theme";
import {
  currentAppearance,
  saveAppearance,
  tauriSettingsSystem,
} from "@presentation/settings/settingsEffects";
import { SectionCard, SectionRow } from "@presentation/components/ui";
import { SelectRow } from "./SettingsShared";

const MODE_LABELS: Record<Mode, string> = {
  escuro: "Escuro",
  claro: "Claro",
};

const ACCENT_LABELS: Record<Accent, string> = {
  azul: "Azul",
  verde: "Verde",
  roxo: "Roxo",
  ambar: "Âmbar",
};

export function AparenciaTab() {
  const config = useAppConfig();

  const [appearance, setAppearance] = useState<Appearance>({ mode: "escuro", accent: "azul" });

  useEffect(() => {
    if (!config.isLoaded) return;
    setAppearance(currentAppearance(config));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAppearance(key: "mode" | "accent", value: Mode | Accent) {
    // Antes de gravar, como sempre foi: a tela troca na hora, e a escrita vem depois.
    setAppearance(resolveAppearance({ ...appearance, [key]: value }));
    await saveAppearance(config, tauriSettingsSystem, appearance, key, value);
  }

  return (
    <SectionCard title="Aparência" divided>
      <SectionRow>
        <SelectRow
          label="Modo"
          description="Claridade das superfícies da interface"
          value={appearance.mode}
          options={MODES.map((m) => ({ value: m, label: MODE_LABELS[m] }))}
          onChange={(v) => handleAppearance("mode", v as Mode)}
        />
      </SectionRow>
      <SectionRow>
        <SelectRow
          label="Cor de destaque"
          description="Tinge botões, links e o anel do overlay"
          value={appearance.accent}
          options={ACCENTS.map((a) => ({ value: a, label: ACCENT_LABELS[a] }))}
          onChange={(v) => handleAppearance("accent", v as Accent)}
        />
      </SectionRow>
    </SectionCard>
  );
}
