import { describe, it, expect } from "vitest";
import { errorDetail } from "@shared/utils/errorDetail";
import { MondayNetworkError } from "@infra/integrations/monday/errors";

/** Erro com causa, sem depender do `cause` do ES2022 (o projeto compila ES2021). */
function withCause(message: string, cause: unknown): Error {
  return Object.assign(new Error(message), { cause });
}

describe("errorDetail", () => {
  it("extrai a causa de um erro que a carrega", () => {
    expect(errorDetail(withCause("falhou", new TypeError("Failed to fetch")))).toBe(
      "TypeError: Failed to fetch"
    );
  });

  it("lê o originalCause das classes de erro das integrações", () => {
    // É o caso que motivou tudo: a causa existia e nunca chegava à tela.
    const err = new MondayNetworkError(new TypeError("Failed to fetch"));

    expect(errorDetail(err)).toBe("TypeError: Failed to fetch");
  });

  it("omite o nome quando a causa é um Error genérico", () => {
    expect(errorDetail(withCause("falhou", new Error("ECONNREFUSED")))).toBe("ECONNREFUSED");
  });

  it("aceita causa que não é Error", () => {
    expect(errorDetail(withCause("falhou", "certificado recusado"))).toBe("certificado recusado");
    expect(errorDetail(withCause("falhou", 500))).toBe("500");
  });

  it("devolve indefinido quando não há causa", () => {
    expect(errorDetail(new Error("falhou"))).toBeUndefined();
    expect(errorDetail(new MondayNetworkError())).toBeUndefined();
    expect(errorDetail(withCause("falhou", null))).toBeUndefined();
    expect(errorDetail("nem é erro")).toBeUndefined();
    expect(errorDetail(undefined)).toBeUndefined();
  });

  it("cala quando a causa só repete a mensagem já visível", () => {
    // Ruído com cara de informação: o tooltip prometeria um detalhe e mostraria
    // a mesma frase que está na linha.
    expect(errorDetail(withCause("Falhou", new Error("Falhou")))).toBeUndefined();
  });

  it("trunca causa longa — é tooltip, não parágrafo", () => {
    const detail = errorDetail(withCause("x", "a".repeat(500)))!;

    expect(detail).toHaveLength(201);
    expect(detail.endsWith("…")).toBe(true);
  });
});
