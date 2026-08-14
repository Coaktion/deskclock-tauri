import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "./sourceFiles";

/**
 * Os baselines das travas de convenção são objetos chaveados pelo caminho. Se o
 * separador mudar com o sistema operacional, nenhuma chave bate: cada arquivo
 * vira regressão sobre um baseline lido como zero, e o baseline inteiro vira
 * entrada obsoleta. No Linux passa; no Windows reprova a suíte inteira.
 */
describe("listSourceFiles", () => {
  const files = listSourceFiles(resolve(__dirname, "../../.."));

  it("devolve caminho com separador POSIX, em qualquer sistema", () => {
    expect(files.filter((f) => f.includes("\\"))).toEqual([]);
  });

  it("devolve caminho relativo à raiz do repositório", () => {
    expect(files.filter((f) => !f.startsWith("src/"))).toEqual([]);
  });

  it("deixa a própria suíte de fora", () => {
    expect(files.filter((f) => f.startsWith("src/tests/"))).toEqual([]);
  });
});
