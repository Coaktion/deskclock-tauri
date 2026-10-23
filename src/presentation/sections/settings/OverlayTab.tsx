import { Button, SectionCard, SectionRow, SettingLabel, Toggle } from "@presentation/components/ui";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_OPACITY_RANGE } from "@domain/usecases/settings/settingsRules";
import {
  saveOverlayOpacity,
  saveOverlaySnapToGrid,
  tauriSettingsSystem,
} from "@presentation/settings/settingsEffects";
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
    tauriSettingsSystem
      .displayServer()
      .then(setDisplayServer)
      .catch(() => {});
  }, []);

  async function handleSlider(value: number) {
    setOverlayOpacity(value);
    await saveOverlayOpacity(config, tauriSettingsSystem, value);
  }

  async function handleSnapToGrid(value: boolean) {
    setOverlaySnapToGrid(value);
    await saveOverlaySnapToGrid(config, tauriSettingsSystem, value);
  }

  return (
    <SectionCard title="Overlay" divided>
      <SectionRow className="flex items-center justify-between gap-4">
        <SettingLabel label="Visibilidade" description="Mesma ação do atalho de overlay" />
        <Button onClick={() => tauriSettingsSystem.toggleOverlay().catch(() => {})}>
          Mostrar / Ocultar overlay
        </Button>
      </SectionRow>
      <SectionRow>
        <SliderRow
          label="Opacidade em repouso"
          description="Opacidade quando o cursor não está sobre o overlay"
          value={overlayOpacity}
          min={OVERLAY_OPACITY_RANGE.min}
          max={OVERLAY_OPACITY_RANGE.max}
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
