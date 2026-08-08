import { readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/**
 * Todo `.ts`/`.tsx` de produção, em caminho relativo à raiz do repositório.
 *
 * A própria suíte fica de fora: um teste de convenção que se varresse contaria
 * as ocorrências escritas dentro do baseline dele mesmo.
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
        found.push(relative(root, full));
      }
    }
  }

  walk(resolve(root, "src"));
  return found.sort();
}
