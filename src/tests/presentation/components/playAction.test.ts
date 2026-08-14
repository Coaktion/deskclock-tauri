import { describe, it, expect } from "vitest";
import {
  isPlayBlocked,
  playTitle,
  resolvePlayBlock,
  PLAY_BLOCKED_TITLE,
  PLAY_SELF_TITLE,
} from "@presentation/components/playAction";

describe("resolvePlayBlock", () => {
  it("sem execução em curso, nada bloqueia", () => {
    expect(resolvePlayBlock(null, "pt-1")).toBe("none");
  });

  it("a linha de que a execução nasceu é `self`", () => {
    expect(resolvePlayBlock("pt-1", "pt-1")).toBe("self");
  });

  it("as demais linhas são `other`", () => {
    expect(resolvePlayBlock("pt-1", "pt-2")).toBe("other");
  });

  it("a chave é opaca — serve tanto id de planejada quanto chave de grupo", () => {
    // É o que permite às Entradas e às Executadas usarem o mesmo helper com o
    // `taskGroupKey` (§6.3), onde não há id ligando a linha à execução.
    const key = "Daily|proj-1|cat-1|";
    expect(resolvePlayBlock(key, key)).toBe("self");
  });
});

describe("playTitle", () => {
  it("em repouso devolve o rótulo da tela", () => {
    expect(playTitle("none")).toBe("Iniciar");
    expect(playTitle("none", "Repetir tarefa")).toBe("Repetir tarefa");
  });

  it("a linha em execução diz que é ela, não que é outra", () => {
    // O rótulo de repouso não vaza para o bloqueio: quem já está rodando não
    // pode ler "Repetir tarefa" nem a frase genérica.
    expect(playTitle("self", "Repetir tarefa")).toBe(PLAY_SELF_TITLE);
  });

  it("as demais linhas dizem que há outra em execução", () => {
    expect(playTitle("other", "Repetir tarefa")).toBe(PLAY_BLOCKED_TITLE);
  });
});

describe("isPlayBlocked", () => {
  it("os dois bloqueios desabilitam; o repouso, não", () => {
    expect(isPlayBlocked("none")).toBe(false);
    expect(isPlayBlocked("self")).toBe(true);
    expect(isPlayBlocked("other")).toBe(true);
  });
});
