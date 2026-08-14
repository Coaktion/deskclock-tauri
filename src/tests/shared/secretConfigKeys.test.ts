import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { SECRET_CONFIG_KEYS } from "@shared/constants/secretConfigKeys";
import type { ConfigKey } from "@shared/types/appConfig";

import { blankComments } from "../helpers/jsxTags";

/**
 * Toda chave de credencial do `AppConfig` está em `SECRET_CONFIG_KEYS` ou numa
 * lista explícita de isentas.
 *
 * É o que impede a integração nº 6 de mandar o token dela para o Google Drive
 * sem ninguém notar: o backup expurga do snapshot só o que a lista nomeia, e
 * uma lista mantida à mão envelhece calada. Aqui o esquecimento vira falha de
 * CI com o nome da chave nova.
 *
 * A varredura lê o **arquivo**, não o tipo: `keyof AppConfig` não existe em
 * tempo de execução, e o mesmo apagão que deixaria a chave fora da lista a
 * deixaria fora de qualquer objeto de exemplo escrito à mão aqui.
 */

const CREDENTIAL_PATTERN = /token|apikey|secret|password/i;

/**
 * Casam o padrão sem serem credencial. São validades em epoch — o valor delas
 * num backup não abre porta nenhuma, e expurgá-las só deixaria o snapshot
 * mentindo sobre quando o token expirou.
 */
const EXEMPT: readonly ConfigKey[] = ["googleTokenExpiry", "zendeskTokenExpiry"];

function declaredConfigKeys(): string[] {
  const file = resolve(__dirname, "../../shared/types/appConfig.ts");
  const source = blankComments(readFileSync(file, "utf8"));
  return [...source.matchAll(/^ {2}([A-Za-z_]\w*)\??:/gm)].map((match) => match[1]);
}

describe("SECRET_CONFIG_KEYS", () => {
  it("cobre toda chave de credencial declarada no AppConfig", () => {
    const declared = declaredConfigKeys();
    expect(declared).toContain("googleRefreshToken");

    const uncovered = declared
      .filter((key) => CREDENTIAL_PATTERN.test(key))
      .filter((key) => !SECRET_CONFIG_KEYS.includes(key as ConfigKey))
      .filter((key) => !EXEMPT.includes(key as ConfigKey));

    expect(uncovered).toEqual([]);
  });

  it("não isenta o que também declara como segredo", () => {
    const contradictory = EXEMPT.filter((key) => SECRET_CONFIG_KEYS.includes(key));
    expect(contradictory).toEqual([]);
  });

  it("só nomeia chaves que existem", () => {
    const declared = new Set(declaredConfigKeys());
    const ghosts = [...SECRET_CONFIG_KEYS, ...EXEMPT].filter((key) => !declared.has(key));
    expect(ghosts).toEqual([]);
  });
});
