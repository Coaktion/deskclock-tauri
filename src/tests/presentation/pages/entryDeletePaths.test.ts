import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * As duas telas da G5 apagam lançamento por **uma** porta, a do desfazer
 * (`useTaskUndo` → `useUndoableDelete`, G1): a linha e o lote da seleção passam
 * pelo mesmo `removeWithUndo`. A G5 mudou por onde se **chega** ao excluir (o ⋯
 * e o clique direito, no lugar do botão do hover) e não podia abrir uma segunda
 * porta — excluir sem desfazer volta a ser irreversível, e isso não se vê na
 * tela nem no teste da linha, que só enxerga a prop que recebeu.
 *
 * No Histórico são dois arquivos: o hook monta o desfazer e a página chama. A
 * guarda tem de olhar os **dois** — apagar direto na página passaria por baixo
 * de uma lista que só tivesse o hook.
 *
 * O popup entrou na lista com a **H3**, que deu menu às executadas: até ali não
 * havia como apagar lançamento por aquela janela, e a porta que nasceu tinha de
 * nascer já no desfazer.
 */
function sourceOf(path: string): string {
  return readFileSync(resolve(__dirname, "../../../..", path), "utf8");
}

const HISTORY_PAGE = "src/presentation/pages/HistoryPage.tsx";
const RETROACTIVE_PAGE = "src/presentation/pages/RetroactivePage.tsx";

const POPUP = "src/presentation/overlays/PopupOverlayContent.tsx";

const SURFACES: Record<string, readonly string[]> = {
  Histórico: ["src/presentation/hooks/useHistory.ts", HISTORY_PAGE],
  "Lançamento Manual": [RETROACTIVE_PAGE],
  "popup, executadas": [POPUP],
};

describe("excluir lançamento passa pelo desfazer em toda lista que o apaga", () => {
  for (const [tela, paths] of Object.entries(SURFACES)) {
    const sources = paths.map(sourceOf);

    it(`${tela} monta o \`useTaskUndo\``, () => {
      expect(sources.some((s) => s.includes("useTaskUndo("))).toBe(true);
      expect(sources.some((s) => s.includes("removeWithUndo"))).toBe(true);
    });

    it.each(paths)("%s não tem uma segunda porta de exclusão", (path) => {
      const source = sourceOf(path);
      // O repositório direto e o use case singular: os dois apagam sem snapshot.
      expect(source).not.toMatch(/taskRepo\.delete\b/);
      expect(source).not.toMatch(/\bdeleteTask\(/);
    });
  }

  // Um por linha e um pelo lote da seleção, nas duas telas.
  it.each([HISTORY_PAGE, RETROACTIVE_PAGE])(
    "em %s a linha e o lote chamam o mesmo `removeWithUndo`",
    (path) => {
      expect(sourceOf(path).match(/removeWithUndo\(\[/g)).toHaveLength(2);
    }
  );
});
