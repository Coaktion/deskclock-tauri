import { useAppConfigOrNull } from "@presentation/contexts/ConfigContext";
import { DEFAULT_WEEK_START, type WeekStart } from "@shared/types/appConfig";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * O primeiro dia da semana desta janela, acompanhando a troca feita em qualquer
 * outra.
 *
 * Fora do provider — os primitivos de `components/ui/` montados sozinhos no
 * teste — devolve segunda, o padrão.
 *
 * **Evento chegando antes da carga é perdido**: o efeito de carga escreve por
 * cima do que o handler acabou de receber. A janela é o boot da janela, e o
 * valor que vence é o gravado — o mesmo desenho do `useAppearanceSync`.
 *
 * O evento existe porque a config de uma janela é um retrato do mount: o
 * overlay e o popup não saberiam do que a janela principal acabou de gravar, e
 * o totalizador da semana continuaria contando do dia antigo até reabrir.
 */
export function useWeekStart(): WeekStart {
  const config = useAppConfigOrNull();
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStart>(DEFAULT_WEEK_START);

  useEffect(() => {
    if (!config?.isLoaded) return;
    setWeekStartsOn(config.get("weekStartsOn"));
  }, [config?.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === "weekStartsOn") setWeekStartsOn(payload.value as WeekStart);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return weekStartsOn;
}
