import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * A lista de dias que a recorrência oferece mora num lugar só.
 *
 * Esta trava nasce de um defeito já acontecido: a mesma lista chegou a estar
 * copiada em **quatro** editores de tarefa planejada, e quando o fim de semana
 * saiu do planejamento as quatro precisaram ser corrigidas à mão. Foi por isso
 * que trazê-lo de volta virou uma mudança em quatro arquivos em vez de uma —
 * e uma quinta cópia esquecida ofereceria cinco dias em silêncio, com a config
 * ligada, sem nada na tela dizendo que aquele editor discorda dos outros.
 *
 * São **duas** buscas porque as quatro cópias históricas tinham duas formas: a
 * lista de objetos com rótulo (três dos editores) e a lista nua de números do
 * `ImportCalendarModal`. Um padrão só que exigisse `value:` colado a `label:`
 * deixaria a segunda passar, e a trava afirmaria mais do que faz.
 *
 * O que se procura é a **declaração** da lista, não a menção a um dia. Tabela
 * de rótulo indexada pela escala do `Date` — `DAY_LABELS`, `DAY_SHORT`,
 * `DAY_SHORT_PT` — é outra coisa e continua livre: ela tem sempre sete entradas
 * e não decide o que é oferecido. Por isso `label:` com dia abreviado não gera
 * falso positivo: medido, o único arquivo do `src/` que casa é a própria fonte.
 */
const WEEKDAY_OPTION = /label:\s*"(Seg|Dom|Ter|Qua|Qui|Sex|Sáb)"/;

/** A lista nua de dias úteis — a forma que o `ImportCalendarModal` usava. */
const BARE_WEEKDAY_LIST = /\[\s*1\s*,\s*2\s*,\s*3\s*,\s*4\s*,\s*5\s*\]/;

/** A fonte única. É o único arquivo onde a lista pode ser declarada. */
const SOURCE_OF_TRUTH = "src/shared/utils/weekdays.ts";

describe("convenção: os dias da semana têm uma fonte só", () => {
  it("nenhum arquivo além da fonte declara a lista de dias oferecidos", () => {
    const root = resolve(__dirname, "../../..");
    const files = listSourceFiles(root);
    expect(files.length).toBeGreaterThan(0);

    const copies = files.filter((file) => {
      if (file === SOURCE_OF_TRUTH) return false;
      const source = readFileSync(resolve(root, file), "utf8");
      return WEEKDAY_OPTION.test(source) || BARE_WEEKDAY_LIST.test(source);
    });

    expect(copies).toEqual([]);
  });

  it("a fonte continua sendo encontrada pelo padrão que a trava procura", () => {
    // Sem isto a trava passaria vazia no dia em que a lista mudasse de forma:
    // nenhuma cópia encontrada porque o padrão não acha mais nem o original.
    const root = resolve(__dirname, "../../..");
    expect(WEEKDAY_OPTION.test(readFileSync(resolve(root, SOURCE_OF_TRUTH), "utf8"))).toBe(true);
  });

  it("reconhece as duas formas que as cópias históricas tinham", () => {
    // As quatro cópias reais, recuperadas do `git`. Uma trava que reconhecesse
    // só a forma com rótulo deixaria voltar exatamente a que mais escapa: a
    // lista de números, que não escreve o nome de dia nenhum.
    expect(WEEKDAY_OPTION.test('{ value: 1, label: "Seg" }')).toBe(true);
    expect(WEEKDAY_OPTION.test('{ value: 1, label: "Seg", title: "Segunda" }')).toBe(true);
    expect(WEEKDAY_OPTION.test('{ label: "Seg", value: 1 }')).toBe(true);
    expect(BARE_WEEKDAY_LIST.test("const WEEKDAY_VALUES = [1, 2, 3, 4, 5];")).toBe(true);
  });
});
