import { describe, it, expect } from "vitest";
import {
  MONDAY_MAPPING_CACHE_VERSION,
  shouldMigrateMondayMappingCache,
  type MondayMappingCacheMigrationState,
} from "@domain/usecases/monday/mondayMappingCachePolicy";

function makeState(
  overrides: Partial<MondayMappingCacheMigrationState> = {}
): MondayMappingCacheMigrationState {
  return {
    storedVersion: 0,
    currentVersion: MONDAY_MAPPING_CACHE_VERSION,
    apiKey: "key",
    portfolioBoardId: "90000000001",
    ...overrides,
  };
}

// As três versões entram fixas, e não via `MONDAY_MAPPING_CACHE_VERSION`: o
// procedimento documentado é bumpar a constante, e amarrados a ela estes casos
// passariam a testar outra coisa — "à frente" viraria "igual", calado.
describe("shouldMigrateMondayMappingCache", () => {
  it("migra quando o mapeamento é anterior ao versionamento do cache", () => {
    // Ausente vira 0 na leitura da config: é o mapeamento gravado sem
    // `statusLabels`, o que esta migração existe para consertar.
    expect(shouldMigrateMondayMappingCache(makeState())).toBe(true);
  });

  it("migra quando a versão gravada ficou para trás da atual", () => {
    expect(
      shouldMigrateMondayMappingCache(makeState({ storedVersion: 1, currentVersion: 2 }))
    ).toBe(true);
  });

  it("não migra quando a versão gravada já é a atual", () => {
    // Uma varredura forçada por instalação, não uma por tique.
    expect(
      shouldMigrateMondayMappingCache(makeState({ storedVersion: 2, currentVersion: 2 }))
    ).toBe(false);
  });

  it("não migra quando a versão gravada está à frente da atual", () => {
    // Quem voltou para um build antigo: o cache novo já tem o que o build velho
    // sabe ler, e forçar a releitura só gastaria requisição a cada abertura.
    expect(
      shouldMigrateMondayMappingCache(makeState({ storedVersion: 3, currentVersion: 2 }))
    ).toBe(false);
  });

  it("não migra sem chave de API nem sem board de Portfólio", () => {
    // Mesma guarda de `shouldSyncMondayProjects`: sem os dois não há o que reler.
    expect(shouldMigrateMondayMappingCache(makeState({ apiKey: "" }))).toBe(false);
    expect(shouldMigrateMondayMappingCache(makeState({ portfolioBoardId: "" }))).toBe(false);
  });
});
