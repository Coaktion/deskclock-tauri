import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { DEFAULT_RETROACTIVE_ENTRY_MODE, type RetroactiveEntryMode } from "@shared/types/appConfig";
import { useCallback, useEffect, useState } from "react";

/**
 * A aba da coluna de entrada do Lançamento Manual, ligada à config. O espelho
 * em estado local é o mesmo do `usePersistedFlag`: `config.set` grava num ref e
 * não re-renderiza ninguém.
 *
 * Mora na página, e não no formulário, porque o pré-preenchimento (planejada ou
 * deeplink) também troca a aba: ele preenche campos que só o formulário mostra.
 */
export function useRetroactiveEntryMode(): {
  mode: RetroactiveEntryMode;
  setMode: (next: RetroactiveEntryMode) => void;
} {
  const config = useAppConfig();
  const [mode, setLocalMode] = useState<RetroactiveEntryMode>(DEFAULT_RETROACTIVE_ENTRY_MODE);

  // `config` fora das dependências pelo mesmo motivo do `usePersistedFlag`: o
  // provider devolve um objeto novo a cada render, e o que importa é a carga.
  useEffect(() => {
    if (!config.isLoaded) return;
    setLocalMode(config.get("retroactiveEntryMode"));
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = useCallback(
    (next: RetroactiveEntryMode) => {
      setLocalMode(next);
      void config.set("retroactiveEntryMode", next);
    },
    [config]
  );

  return { mode, setMode };
}
