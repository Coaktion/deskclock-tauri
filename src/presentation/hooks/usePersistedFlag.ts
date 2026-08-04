import { useAppConfig } from "@presentation/contexts/ConfigContext";
import type { AppConfig, ConfigKey } from "@shared/types/appConfig";
import { useCallback, useEffect, useState } from "react";

/** Só as chaves booleanas da config — as outras não têm o que alternar. */
export type BooleanConfigKey = {
  [K in ConfigKey]: AppConfig[K] extends boolean ? K : never;
}[ConfigKey];

/**
 * Liga um booleano de UI a uma chave da config. O estado local existe porque
 * `config.set` grava num ref e **não** re-renderiza ninguém: sem o espelho, o
 * botão mudaria a config e a tela continuaria igual.
 *
 * Enquanto a config não carregou, vale o `false` — o valor real chega no efeito.
 * Para uma coluna que se recolhe, isso significa aparecer aberta por um instante
 * e então recolher, que é a ordem menos incômoda das duas.
 */
export function usePersistedFlag(key: BooleanConfigKey): {
  value: boolean;
  toggle: () => void;
  set: (next: boolean) => void;
} {
  const config = useAppConfig();
  const [value, setValue] = useState(false);

  // `config` fora das dependências de propósito: o provider devolve um objeto
  // novo a cada render, e reagir a ele faria o efeito reescrever o estado local
  // a cada render do pai. O que importa aqui é o momento em que o load termina.
  useEffect(() => {
    if (!config.isLoaded) return;
    setValue(config.get(key));
  }, [config.isLoaded, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = useCallback(
    (next: boolean) => {
      setValue(next);
      void config.set(key, next);
    },
    [config, key]
  );

  const toggle = useCallback(() => set(!value), [set, value]);

  return { value, toggle, set };
}
