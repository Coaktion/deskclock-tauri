import { useLiveConfig } from "@presentation/hooks/useLiveConfig";
import { DEFAULT_WEEK_START, type WeekStart } from "@shared/types/appConfig";

/**
 * O primeiro dia da semana desta janela, acompanhando a troca feita em qualquer
 * outra. Fora do provider devolve segunda, o padrão.
 *
 * O porquê do evento e da carga que vence — em `useLiveConfig`.
 */
export function useWeekStart(): WeekStart {
  return useLiveConfig("weekStartsOn", DEFAULT_WEEK_START);
}
