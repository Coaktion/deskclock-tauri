import { Button, SectionCard, SectionRow, SettingLabel, Toggle } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { SliderRow } from "./SettingsShared";

/**
 * O cartão é "Overlay", e não "Overlay compacto": a opacidade vale para as duas
 * janelas.
 */
export function OverlayTab() {
  const config = useAppConfig();

  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [displayServer, setDisplayServer] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySnapToGrid(config.get("overlaySnapToGrid"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    invoke<string>("get_display_server")
      .then(setDisplayServer)
      .catch(() => {});
  }, []);

  async function handleSlider(value: number) {
    setOverlayOpacity(value);
    await config.set("overlayOpacity", value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "overlayOpacity",
      value,
    } satisfies OverlayConfigChangedPayload);
  }

  async function handleSnapToGrid(value: boolean) {
    setOverlaySnapToGrid(value);
    await config.set("overlaySnapToGrid", value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "overlaySnapToGrid",
      value,
    } satisfies OverlayConfigChangedPayload);
  }

  return (
    <SectionCard title="Overlay" divided>
      <SectionRow className="flex items-center justify-between gap-4">
        <SettingLabel label="Visibilidade" description="Mesma ação do atalho de overlay" />
        <Button onClick={() => invoke("toggle_overlay").catch(() => {})}>
          Mostrar / Ocultar overlay
        </Button>
      </SectionRow>
      <SectionRow>
        <SliderRow
          label="Opacidade em repouso"
          description="Opacidade quando o cursor não está sobre o overlay"
          value={overlayOpacity}
          min={20}
          max={100}
          unit="%"
          onChange={handleSlider}
        />
      </SectionRow>
      <SectionRow>
        <Toggle
          label="Snap to grid"
          description={
            displayServer === "wayland"
              ? "Não disponível no Wayland — o compositor controla o posicionamento das janelas"
              : "Encaixa o overlay em grade ao soltar o arraste"
          }
          checked={overlaySnapToGrid}
          onChange={handleSnapToGrid}
        />
      </SectionRow>
    </SectionCard>
  );
}
