import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { blankComments, extractJsxTags } from "../helpers/jsxTags";
import { listSourceFiles } from "../helpers/sourceFiles";

/**
 * Os outros testes desta pasta travam **token**: reprovam cor crua,
 * `text-[13px]`, `font-bold`. Nenhum deles reprova um botão escrito à mão com
 * tokens perfeitamente válidos — e é assim que a dívida volta. Foi essa a
 * medição que abriu a rodada de fidelidade: 131 `<button>` com `className`
 * literal, 73 strings de classe distintas entre eles, 47 usadas uma vez só.
 *
 * O que se afirma aqui é o **componente**: quem desenha a própria caixa —
 * padding mais raio — está reescrevendo `Button`/`IconButton`, e quem escreve
 * `<input>`/`<select>`/`<textarea>` cru está reescrevendo `controlStyles`.
 *
 * `presentation/components/ui/` fica de fora das duas listas, e é a única
 * isenção por caminho: é lá que a caixa é **definida**. Em qualquer outro lugar
 * ela é cópia.
 *
 * O baseline é per-arquivo e **só pode encolher**, como em `meaningColors`. O
 * piso não é zero, e as exceções conhecidas estão registradas na §8.4 do
 * CLAUDE.md: o toggle de billable dos três modais de edição (o estado ligado
 * **é** a cor do significado, e no `IconButton` a cor é o destino do hover), a
 * alça de arraste, o ▶ do Lançamento Manual, o `PlannedTaskItem` (cujos botões
 * abrem por largura, não por opacidade) e as definições de
 * `SubSection`/`MappingBox`/`IntegrationTile`, que são primitivos locais.
 */

/** Onde os primitivos são definidos — desenhar a caixa ali é o trabalho deles. */
const PRIMITIVES_DIR = "src/presentation/components/ui/";

/** Padding somado a raio: é a caixa que o `Button` existe para não ser copiada. */
const OWN_BOX = [/\bp[xy]?-\d/, /\brounded-/];

/**
 * Tipos que `Input` recusa por assinatura (§8.4): não têm casca, fundo nem raio,
 * e vesti-los com o vocabulário de campo os quebraria. `file` e `hidden` entram
 * na isenção pelo mesmo motivo.
 */
const EXEMPT_INPUT_TYPES = /type="(checkbox|radio|range|file|hidden)"/;

/**
 * Medido em 2026-08-10, ao fim da fase C. Cada linha é dívida a pagar, não
 * permissão: o número desce quando a tela migra e a linha some quando chega a
 * zero.
 */
const BUTTON_BASELINE: Record<string, number> = {
  "src/App.tsx": 1,
  "src/presentation/components/ActionChip.tsx": 1,
  "src/presentation/components/CategoriesPanel.tsx": 1,
  "src/presentation/components/CategoryCard.tsx": 2,
  "src/presentation/components/CustomFieldCard.tsx": 3,
  "src/presentation/components/CustomFieldsPanel.tsx": 1,
  "src/presentation/components/IntegrationsRail.tsx": 1,
  "src/presentation/components/OmniboxCustomFieldsPanel.tsx": 1,
  "src/presentation/components/OmniboxRunning.tsx": 7,
  "src/presentation/components/PlannedTaskForm.tsx": 3,
  "src/presentation/components/PlannedTaskItem.tsx": 5,
  "src/presentation/components/PlannedTasksSection.tsx": 1,
  "src/presentation/components/ProjectCard.tsx": 3,
  "src/presentation/components/ProjectCategoriesEditor.tsx": 1,
  "src/presentation/components/ProjectsPanel.tsx": 1,
  "src/presentation/components/RetroactiveEntryForm.tsx": 1,
  "src/presentation/components/SelectionBar.tsx": 1,
  "src/presentation/components/Sidebar.tsx": 2,
  "src/presentation/components/TagMultiSelect.tsx": 1,
  "src/presentation/components/TaskCard.tsx": 3,
  "src/presentation/components/TaskGroupCard.tsx": 3,
  "src/presentation/components/WeekPlanningView.tsx": 3,
  "src/presentation/components/WorkspaceSwitcher.tsx": 4,
  "src/presentation/components/WorkspacesPanel.tsx": 8,
  "src/presentation/modals/ClockifyEntriesModal.tsx": 3,
  "src/presentation/modals/ImportCalendarModal.tsx": 2,
  "src/presentation/modals/MondayEntriesModal.tsx": 5,
  "src/presentation/modals/SetupModal.tsx": 1,
  "src/presentation/overlays/CompletedTasksSection.tsx": 1,
  "src/presentation/overlays/MeetingPromptView.tsx": 4,
  "src/presentation/overlays/OverlayWorkspaceChip.tsx": 3,
  "src/presentation/overlays/PlannedTaskEditSheet.tsx": 5,
  "src/presentation/overlays/PlanningOverlay.tsx": 5,
  "src/presentation/overlays/PopupOverlayContent.tsx": 15,
  "src/presentation/overlays/RunningCustomFieldsSheet.tsx": 3,
  "src/presentation/overlays/ToastApp.tsx": 1,
  "src/presentation/pages/RetroactivePage.tsx": 1,
  "src/presentation/sections/integrations/clockify/ClockifyMappingsSection.tsx": 1,
  "src/presentation/sections/integrations/shared.tsx": 1,
  "src/presentation/sections/settings/AtualizacoesTab.tsx": 4,
  "src/presentation/sections/settings/GeralTab.tsx": 1,
  "src/presentation/sections/settings/ShortcutRow.tsx": 1,
};

/**
 * Os seis que sobraram da fase A, todos escrevendo à mão a mesma casca que
 * `Input` traz pronta. São a redução mais barata que resta.
 */
const CONTROL_BASELINE: Record<string, number> = {
  "src/presentation/modals/ClockifyEntriesModal.tsx": 3,
  "src/presentation/modals/MondayEntriesModal.tsx": 2,
  "src/presentation/modals/SetupModal.tsx": 1,
};

function componentFiles(root: string): string[] {
  return listSourceFiles(root).filter((file) => file.endsWith(".tsx"));
}

/**
 * Compara a contagem por arquivo com o baseline, nos **dois** sentidos: subir é
 * regressão, e descer sem atualizar a lista deixa folga onde a próxima
 * regressão se esconde.
 */
function compareToBaseline(current: Record<string, number>, baseline: Record<string, number>) {
  const regressions = Object.entries(current)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => `${file}: ${baseline[file] ?? 0} → ${count}`);

  const stale = Object.entries(baseline)
    .filter(([file, count]) => (current[file] ?? 0) < count)
    .map(([file]) =>
      current[file] ? `${file}: baixe para ${current[file]}` : `${file}: apague a linha`
    );

  return { regressions, stale };
}

describe("convenção: a caixa mora no primitivo", () => {
  it("nenhum arquivo passa da sua linha do baseline de <button>", () => {
    const root = resolve(__dirname, "../../..");
    const files = componentFiles(root).filter((file) => !file.startsWith(PRIMITIVES_DIR));
    expect(files.length).toBeGreaterThan(0);

    const current: Record<string, number> = {};
    for (const file of files) {
      const source = blankComments(readFileSync(resolve(root, file), "utf8"));
      const count = extractJsxTags(source, "button").filter(({ tag }) =>
        OWN_BOX.every((pattern) => pattern.test(tag))
      ).length;
      if (count > 0) current[file] = count;
    }

    const { regressions, stale } = compareToBaseline(current, BUTTON_BASELINE);
    expect(regressions).toEqual([]);
    expect(stale).toEqual([]);
  });

  it("nenhum arquivo passa da sua linha do baseline de campo cru", () => {
    const root = resolve(__dirname, "../../..");
    const files = componentFiles(root).filter((file) => !file.startsWith(PRIMITIVES_DIR));
    expect(files.length).toBeGreaterThan(0);

    const current: Record<string, number> = {};
    for (const file of files) {
      const source = blankComments(readFileSync(resolve(root, file), "utf8"));
      const count =
        extractJsxTags(source, "input").filter(({ tag }) => !EXEMPT_INPUT_TYPES.test(tag)).length +
        extractJsxTags(source, "select").length +
        extractJsxTags(source, "textarea").length;
      if (count > 0) current[file] = count;
    }

    const { regressions, stale } = compareToBaseline(current, CONTROL_BASELINE);
    expect(regressions).toEqual([]);
    expect(stale).toEqual([]);
  });
});
