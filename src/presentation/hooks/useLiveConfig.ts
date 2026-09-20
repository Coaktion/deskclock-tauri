import { useAppConfigOrNull } from "@presentation/contexts/ConfigContext";
import type { AppConfig } from "@shared/types/appConfig";
import { OVERLAY_EVENTS, type OverlayConfigChangedPayload } from "@shared/types/overlayEvents";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";

/**
 * Uma chave da config nesta janela, acompanhando a troca feita em qualquer
 * outra.
 *
 * Fora do provider — os primitivos de `components/ui/` montados sozinhos no
 * teste — devolve o `fallback`.
 *
 * **Evento chegando antes da carga é perdido**: o efeito de carga escreve por
 * cima do que o handler acabou de receber. A janela é o boot da janela, e o
 * valor que vence é o gravado — o mesmo desenho do `useAppearanceSync`.
 *
 * O evento existe porque a config de uma janela é um retrato do mount: o
 * overlay e o popup não saberiam do que a janela principal acabou de gravar, e
 * continuariam com o valor antigo até reabrir. Quem grava do lado da tela de
 * Configurações precisa emitir o `OVERLAY_CONFIG_CHANGED` com a mesma chave.
 */
export function useLiveConfig<K extends keyof AppConfig>(
  key: K,
  fallback: AppConfig[K]
): AppConfig[K] {
  const config = useAppConfigOrNull();
  const [value, setValue] = useState<AppConfig[K]>(fallback);

  useEffect(() => {
    if (!config?.isLoaded) return;
    setValue(config.get(key));
  }, [config?.isLoaded, key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlisten = listen<OverlayConfigChangedPayload>(
      OVERLAY_EVENTS.OVERLAY_CONFIG_CHANGED,
      ({ payload }) => {
        if (payload.key === key) setValue(payload.value as AppConfig[K]);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [key]);

  return value;
}
