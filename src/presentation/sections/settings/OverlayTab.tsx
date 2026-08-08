import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { SectionCard, SectionRow, Toggle } from "@presentation/components/ui";
import { SliderRow } from "./SettingsShared";

export function OverlayTab() {
  const config = useAppConfig();

  const [overlayOpacity, setOverlayOpacity] = useState(100);
  const [overlaySize, setOverlaySize] = useState<"big" | "small">("big");
  const [overlaySnapToGrid, setOverlaySnapToGrid] = useState(false);
  const [displayServer, setDisplayServer] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setOverlayOpacity(config.get("overlayOpacity"));
    setOverlaySize((config.get("overlaySize") as "big" | "small") ?? "big");
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

  async function handleSize(value: "big" | "small") {
    setOverlaySize(value);
    await config.set("overlaySize", value);
    await emit(OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED, {
      key: "overlaySize",
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
        <div className="flex flex-1 items-center justify-between gap-4">
          <div>
            <p className="text-sm text-fg">Tamanho</p>
            <p className="text-xs text-fg-muted mt-0.5">Tamanho visual do overlay compacto</p>
          </div>
          <div className="flex rounded-control overflow-hidden border border-border shrink-0">
            {(["big", "small"] as const).map((size) => (
              <button
                key={size}
                aria-pressed={overlaySize === size}
                onClick={() => handleSize(size)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  overlaySize === size
                    ? "bg-accent/15 text-accent-text"
                    : "bg-raised text-fg-muted hover:text-fg"
                }`}
              >
                {size === "big" ? "Grande" : "Pequeno"}
              </button>
            ))}
          </div>
        </div>
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
