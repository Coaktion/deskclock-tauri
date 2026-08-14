import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { blankComments, extractJsxTags } from "../helpers/jsxTags";
import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * Nenhum `<input>` do app pode sugerir valores do navegador.
 *
 * O atributo é verdade no dia em que se escreve e mentira no mês seguinte: o
 * input novo nasce sem ele e ninguém percebe, porque a falha não é um erro — é
 * o navegador abrindo uma lista de valores antigos por cima do campo. Esta
 * varredura é o que torna o esquecimento visível no CI.
 *
 * Ficam de fora os tipos que não têm autofill (caixa, rádio, botão, faixa,
 * arquivo): exigir o atributo neles seria ruído com cara de regra.
 */

/** Tipos sem lista de autofill do navegador — o atributo ali não significa nada. */
const EXEMPT_TYPES = /type="(checkbox|radio|button|submit|range|file|reset|hidden)"/;

describe("convenção: autofill do navegador desligado", () => {
  it('todo <input> declara autoComplete="off"', () => {
    const root = resolve(__dirname, "../../..");
    const files = listSourceFiles(root).filter((file) => file.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = blankComments(readFileSync(resolve(root, file), "utf8"));
      for (const { tag, line } of extractJsxTags(source, "input")) {
        if (EXEMPT_TYPES.test(tag)) continue;
        if (tag.includes("autoComplete")) continue;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
