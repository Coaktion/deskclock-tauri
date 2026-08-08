import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * A escala tem três pesos e para em 600. O 700 sai porque em 12px sobre fundo
 * escuro ele engorda o texto sem criar hierarquia — o que separa um título do
 * corpo é tamanho e cor, não mais um degrau de peso.
 *
 * O `@font-face` já limita o peso ao intervalo declarado, então um `font-bold`
 * esquecido renderiza como 600 e **não se vê na tela**. É justamente por não se
 * ver que a lista abaixo existe: sem ela, a classe voltaria a se espalhar sem
 * nada denunciando.
 *
 * As ocorrências que restam vivem todas em overlay ou modal, território do
 * último PR da migração. A lista só pode encolher.
 */

const FONT_BOLD = /\bfont-bold\b/g;

/** Congelado em 2026-08-08. Ao migrar uma tela, baixe ou apague a linha dela. */
const BASELINE: Record<string, number> = {
  "src/presentation/components/OmniboxRunning.tsx": 1,
  "src/presentation/modals/ImportCalendarModal.tsx": 1,
  "src/presentation/overlays/CompactOverlay.tsx": 1,
  "src/presentation/overlays/PlannedTaskEditSheet.tsx": 1,
  "src/presentation/overlays/PopupOverlayContent.tsx": 1,
};

describe("convenção: a escala de peso para em 600", () => {
  it("nenhum arquivo passa da sua linha do baseline", () => {
    const root = resolve(__dirname, "../../..");
    const files = listSourceFiles(root);
    expect(files.length).toBeGreaterThan(0);

    const current: Record<string, number> = {};
    for (const file of files) {
      const count = (readFileSync(resolve(root, file), "utf8").match(FONT_BOLD) ?? []).length;
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
