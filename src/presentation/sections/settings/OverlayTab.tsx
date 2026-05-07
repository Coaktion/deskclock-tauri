import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { ToggleRow, SliderRow, SettingsCard, CardRow } from "./SettingsShared";

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
  }

  return (
    <SettingsCard>
      <CardRow>
        <SliderRow
          label="Opacidade em repouso"
          description="Opacidade quando o cursor não está sobre o overlay"
          value={overlayOpacity}
          min={20}
          max={100}
          unit="%"
          onChange={handleSlider}
        />
      </CardRow>
      <CardRow>
        <ToggleRow
          label="Snap to grid"
          description={
            displayServer === "wayland"
              ? "Não disponível no Wayland — o compositor controla o posicionamento das janelas"
              : "Encaixa o overlay em grade ao soltar o arraste"
          }
          value={overlaySnapToGrid}
          onChange={handleSnapToGrid}
        />
      </CardRow>
    </SettingsCard>
  );
}
