import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyAppearance, resolveAppearance, MODES, ACCENTS } from "@shared/utils/theme";
import type { Appearance, Mode, Accent } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
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

  const [fontSize, setFontSize] = useState<"P" | "M" | "G" | "GG">("M");
  const [appearance, setAppearance] = useState<Appearance>({ mode: "escuro", accent: "azul" });

  useEffect(() => {
    if (!config.isLoaded) return;
    setFontSize(config.get("fontSize"));
    setAppearance(
      resolveAppearance({
        mode: config.get("mode"),
        accent: config.get("accent"),
        theme: config.get("theme"),
      })
    );
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAppearance(key: "mode" | "accent", value: Mode | Accent) {
    const next = resolveAppearance({ ...appearance, [key]: value });
    setAppearance(next);
    applyAppearance(next);
    await config.set(key, value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key,
      value,
    } satisfies OverlayConfigChangedPayload);
  }

  async function handleFontSize(value: string) {
    const size = value as "P" | "M" | "G" | "GG";
    setFontSize(size);
    applyFontSize(size);
    await config.set("fontSize", size);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "fontSize",
      value: size,
    } satisfies OverlayConfigChangedPayload);
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
      <SectionRow>
        <SelectRow
          label="Tamanho da fonte"
          description="Escala o texto em toda a interface"
          value={fontSize}
          options={[
            { value: "P", label: "P — Pequeno" },
            { value: "M", label: "M — Médio (padrão)" },
            { value: "G", label: "G — Grande" },
            { value: "GG", label: "GG — Extra grande" },
          ]}
          onChange={handleFontSize}
        />
      </SectionRow>
    </SectionCard>
  );
}
