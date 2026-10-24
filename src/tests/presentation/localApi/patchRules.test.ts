import { describe, expect, it } from "vitest";
import { boolean, parsePatch } from "@presentation/localApi/patchRules";

describe("parsePatch", () => {
  const rules = { enabled: boolean };

  it.each(["constructor", "toString", "hasOwnProperty", "__proto__"])(
    "'%s' é chave desconhecida, não regra herdada",
    (key) => {
      // JSON.parse cria `__proto__` como chave própria, como o corpo da requisição.
      const body = JSON.parse(`{"${key}": 1}`);
      expect(() => parsePatch(body, rules, "Grupo")).toThrow(
        `Configuração desconhecida em Grupo: '${key}'. Válidas: enabled.`
      );
    }
  );

  it("chave válida passa pela regra", () => {
    expect(parsePatch({ enabled: true }, rules, "Grupo")).toEqual({ enabled: true });
    expect(() => parsePatch({ enabled: "sim" }, rules, "Grupo")).toThrow(
      "enabled deve ser true ou false."
    );
  });
});
