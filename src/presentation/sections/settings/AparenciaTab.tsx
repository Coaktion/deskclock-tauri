import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { applyFontSize } from "@shared/utils/fontSize";
import { applyTheme, THEMES } from "@shared/utils/theme";
import type { Theme } from "@shared/utils/theme";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { SelectRow, SettingsCard, CardRow } from "./SettingsShared";

export function AparenciaTab() {
  const config = useAppConfig();

  const [fontSize, setFontSize] = useState<"P" | "M" | "G" | "GG">("M");
  const [theme, setTheme] = useState<Theme>("azul");

  useEffect(() => {
    if (!config.isLoaded) return;
    setFontSize(config.get("fontSize"));
    setTheme(config.get("theme") as Theme);
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleTheme(value: string) {
    const t = value as Theme;
    setTheme(t);
    applyTheme(t);
    await config.set("theme", t);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "theme",
      value: t,
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
    <SettingsCard>
      <CardRow>
        <SelectRow
          label="Tema"
          description="Paleta de cores da interface"
          value={theme}
          options={THEMES.map((t) => ({
            value: t,
            label: t.charAt(0).toUpperCase() + t.slice(1),
          }))}
          onChange={handleTheme}
        />
      </CardRow>
      <CardRow>
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
      </CardRow>
    </SettingsCard>
  );
}
