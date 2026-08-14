import { SectionCard, SectionRow, Toggle } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { SliderRow } from "./SettingsShared";

export function OverlayTab() {
  const config = useAppConfig();

  const [overlayShowOnStart, setOverlayShowOnStart] = useState(true);
  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [displayServer, setDisplayServer] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setOverlayShowOnStart(config.get("overlayShowOnStart"));
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySnapToGrid(config.get("overlaySnapToGrid"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    invoke<string>("get_display_server")
      .then(setDisplayServer)
      .catch(() => {});
  }, []);

  async function handleShowOnStart(value: boolean) {
    setOverlayShowOnStart(value);
    await config.set("overlayShowOnStart", value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "overlayShowOnStart",
      value,
    } satisfies OverlayConfigChangedPayload);
  }

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
    <SectionCard title="Overlay compacto" divided>
      <SectionRow>
        <Toggle
          label="Mostrar ao iniciar tarefa"
          description="Abre o overlay assim que uma tarefa começa a rodar"
          checked={overlayShowOnStart}
          onChange={handleShowOnStart}
        />
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
