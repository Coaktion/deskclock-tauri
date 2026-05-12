import { useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { ToggleRow, SliderRow, SettingsCard, CardRow } from "./SettingsShared";

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
    <SettingsCard>
      <CardRow>
        <div className="flex flex-1 items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-200">Tamanho</p>
            <p className="text-xs text-gray-400">Tamanho visual do overlay compacto</p>
          </div>
          <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
            {(["big", "small"] as const).map((size) => (
              <button
                key={size}
                onClick={() => handleSize(size)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  overlaySize === size
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {size === "big" ? "Grande" : "Pequeno"}
              </button>
            ))}
          </div>
        </div>
      </CardRow>
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
