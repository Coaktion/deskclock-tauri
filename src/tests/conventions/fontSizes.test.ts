import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * A escala tipográfica é um conjunto fechado: `text-xl` (20), `text-metric`
 * (17), `text-base` (16), `text-lead` (15), `text-body` (14), `text-sm`
 * (12,25), `text-micro` (11), `text-xs` (10,5), `text-overline` (10, com peso e
 * tracking próprios) e `text-nav` (9). Tamanho em px arbitrário fica de fora.
 *
 * Os três últimos degraus a entrar — `nav`, `micro`, `lead` — vieram do censo
 * de `font-size` no spec extraído dos wireframes: 9px em 56 lugares, 11px em
 * 40, 15px em 2. Enquanto não existiam, **este teste era o que impedia a
 * fidelidade neles** — proibia `text-[11px]` sem haver token para pôr no lugar,
 * e cada um desses 96 pontos renderizava um degrau vizinho. O conjunto ser
 * fechado é a regra certa; fechá-lo antes de medir o design foi o erro.
 *
 * Ao contrário dos outros testes de convenção desta pasta, este nasce **sem
 * baseline**: as 176 ocorrências que existiam foram convertidas de uma vez, e
 * congelar um resto recriaria a dívida que a varredura fecha — foi assim que
 * `text-[10.5px]` apareceu, alguém precisando do valor que a raiz de 14px
 * renderizava e escrevendo-o à mão.
 *
 * O que se afirma é só a ausência da classe arbitrária. Um `style` com
 * `fontSize` calculado em runtime continua possível e não é o que se combate
 * aqui — o alvo é a classe copiada de outra tela.
 */

const ARBITRARY_TEXT_SIZE = /\btext-\[[^\]]*(?:px|rem|em)\]/g;

describe("convenção: tamanho de fonte só pela escala", () => {
  it("nenhum .tsx declara tamanho arbitrário", () => {
    const root = resolve(__dirname, "../../..");
    const files = listSourceFiles(root).filter((file) => file.endsWith(".tsx"));
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const lines = readFileSync(resolve(root, file), "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const match of line.match(ARBITRARY_TEXT_SIZE) ?? []) {
          offenders.push(`${file}:${index + 1} — ${match}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
