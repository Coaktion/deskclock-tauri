import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

/**
 * Extrai cada `<input …>` do fonte.
 *
 * Regex sozinha não serve: props como `onKeyDown={(e) => …}` contêm `>`, e um
 * `[^>]*` para no meio do atributo — o input inteiro passaria despercebido.
 * Daí o contador de chaves, que só aceita como fim da tag o `>` fora delas.
 */
function extractInputTags(source: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  const opener = /<input\b/g;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    for (let i = opener.lastIndex; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (depth > 0 && (char === '"' || char === "'" || char === "`")) {
        // String dentro de uma expressão: pular inteira, para que uma chave ou
        // um `>` literal dentro dela não conte.
        const quote = char;
        i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === "\\") i++;
          i++;
        }
      } else if (char === ">" && depth === 0) {
        tags.push({
          tag: source.slice(match.index, i + 1),
          line: source.slice(0, match.index).split("\n").length,
        });
        break;
      }
    }
  }
  return tags;
}

/** Todos os `.tsx` de `src/`, menos os próprios testes. */
function listComponentFiles(root: string): string[] {
  const found: string[] = [];
  const testsDir = resolve(root, "src/tests");

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== testsDir) walk(full);
      } else if (entry.name.endsWith(".tsx")) {
        found.push(relative(root, full));
      }
    }
  }

  walk(resolve(root, "src"));
  return found.sort();
}

describe("convenção: autofill do navegador desligado", () => {
  it('todo <input> declara autoComplete="off"', () => {
    const root = resolve(__dirname, "../../..");
    const files = listComponentFiles(root);
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(root, file), "utf8");
      for (const { tag, line } of extractInputTags(source)) {
        if (EXEMPT_TYPES.test(tag)) continue;
        if (tag.includes("autoComplete")) continue;
        offenders.push(`${file}:${line}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
