import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * Cor de significado — billable, pausa, erro — tem token próprio (`bg-billable`,
 * `text-danger`). A paleta crua não serve para isso por um motivo de correção, e
 * não de gosto: enquanto `green-*` era remapeada por tema, hora faturável
 * pintada de verde ficava indistinguível do acento.
 *
 * A migração acabou e a lista chegou a zero, tirando um caso: a paleta de
 * workspace. Ali `rose` e as irmãs são **cor de entidade**, escolhida pelo
 * usuário num seletor — não significam faturável nem erro, e um token de
 * significado seria justamente a tradução errada. A lista curada e o porquê de
 * cada exclusão vivem em `domain/utils/workspaceColor.ts`.
 */

const MEANING_COLOR =
  /\b(bg|text|border|ring|fill|stroke|accent|from|to|via|divide|placeholder|shadow|decoration|outline)-(emerald|green|rose|red)-\d+/g;

/** Zerado em 2026-08-08, no fim da migração. A lista só pode encolher. */
const BASELINE: Record<string, number> = {
  "src/presentation/components/WorkspaceDot.tsx": 6,
};

describe("convenção: cor de significado só por token", () => {
  it("nenhum arquivo passa da sua linha do baseline", () => {
    const root = resolve(__dirname, "../../..");
    const files = listSourceFiles(root);
    expect(files.length).toBeGreaterThan(0);

    const current: Record<string, number> = {};
    for (const file of files) {
      const count = (readFileSync(resolve(root, file), "utf8").match(MEANING_COLOR) ?? []).length;
      if (count > 0) current[file] = count;
    }

    const regressions = Object.entries(current)
      .filter(([file, count]) => count > (BASELINE[file] ?? 0))
      .map(([file, count]) => `${file}: ${BASELINE[file] ?? 0} → ${count}`);
    expect(regressions).toEqual([]);

    // O baseline em dia é o que dá sentido ao número: uma linha que sobrou alta
    // esconde uma regressão futura dentro da folga que ela deixou.
    const stale = Object.entries(BASELINE)
      .filter(([file, count]) => (current[file] ?? 0) < count)
      .map(([file]) =>
        current[file] ? `${file}: baixe para ${current[file]}` : `${file}: apague a linha`
      );
    expect(stale).toEqual([]);
  });
});
