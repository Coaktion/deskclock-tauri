import { useLiveConfig } from "@presentation/hooks/useLiveConfig";
import { DEFAULT_SHOW_WEEKEND } from "@shared/types/appConfig";

/**
 * Se sábado e domingo entram no planejamento desta janela, acompanhando a troca
 * feita em qualquer outra. Fora do provider devolve desligado, o padrão.
 *
 * O porquê do evento e da carga que vence — em `useLiveConfig`.
 */
export function useShowWeekend(): boolean {
  return useLiveConfig("showWeekend", DEFAULT_SHOW_WEEKEND);
}
