import { readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/**
 * Todo `.ts`/`.tsx` de produção, em caminho relativo à raiz do repositório.
 *
 * A própria suíte fica de fora: um teste de convenção que se varresse contaria
 * as ocorrências escritas dentro do baseline dele mesmo.
 *
 * O separador é sempre `/`, inclusive no Windows: os baselines são objetos com
 * o caminho na chave, e `relative()` devolveria `src\App.tsx` lá. Nenhuma chave
 * bateria — cada arquivo viraria regressão sobre um baseline lido como zero, e
 * o baseline inteiro viraria entrada obsoleta. Foi o que derrubou o job do
 * Windows na v2.0.0, com o do Ubuntu passando ao lado.
 */
export function listSourceFiles(root: string): string[] {
  const found: string[] = [];
  const testsDir = resolve(root, "src/tests");

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (full !== testsDir) walk(full);
      } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts")) {
        found.push(relative(root, full).split(sep).join("/"));
      }
    }
  }

  walk(resolve(root, "src"));
  return found.sort();
}
