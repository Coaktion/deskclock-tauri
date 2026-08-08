import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Cor de significado — billable, pausa, erro — tem token próprio (`bg-billable`,
 * `text-danger`). A paleta crua não serve para isso por um motivo de correção, e
 * não de gosto: `green-*` é justamente a família que o tema Verde remapeia, então
 * hora faturável pintada de verde fica indistinguível do acento nesse tema.
 *
 * As ocorrências que ainda existem estão congeladas abaixo, e a lista só pode
 * encolher. É o que impede a migração de ganhar violação nova no meio do
 * caminho: sem ela, a varredura do último PR seria a única rede, e o que ela
 * encontrasse já teria semanas de idade.
 */

const MEANING_COLOR =
  /\b(bg|text|border|ring|fill|stroke|accent|from|to|via|divide|placeholder|shadow|decoration|outline)-(emerald|green|rose|red)-\d+/g;

/** Congelado em 2026-08-07. Ao migrar uma tela, baixe ou apague a linha dela. */
const BASELINE: Record<string, number> = {
  "src/App.tsx": 2,
  "src/presentation/components/CategoryCard.tsx": 8,
  "src/presentation/components/CustomFieldCard.tsx": 3,
  "src/presentation/components/DatePickerInput.tsx": 3,
  "src/presentation/components/IntegrationsRail.tsx": 2,
  "src/presentation/components/OmniboxCustomFieldsPanel.tsx": 1,
  "src/presentation/components/OmniboxIdle.tsx": 4,
  "src/presentation/components/OmniboxRunning.tsx": 18,
  "src/presentation/components/PlannedTaskForm.tsx": 3,
  "src/presentation/components/PlannedTaskItem.tsx": 7,
  "src/presentation/components/PlannedTasksSection.tsx": 2,
  "src/presentation/components/ProjectCard.tsx": 3,
  "src/presentation/components/RetroactiveEntryForm.tsx": 2,
  "src/presentation/components/RunningTaskEditForm.tsx": 3,
  "src/presentation/components/RunningTaskSection.tsx": 5,
  "src/presentation/components/SelectionBar.tsx": 3,
  "src/presentation/components/TaskCard.tsx": 4,
  "src/presentation/components/TaskGroupCard.tsx": 2,
  "src/presentation/components/TitleBar.tsx": 1,
  "src/presentation/components/ToggleBillable.tsx": 3,
  "src/presentation/components/TotalsSection.tsx": 2,
  "src/presentation/components/WeekPlanningView.tsx": 2,
  "src/presentation/components/WorkspaceDot.tsx": 6,
  "src/presentation/components/WorkspaceSwitcher.tsx": 2,
  "src/presentation/components/WorkspacesPanel.tsx": 6,
  "src/presentation/modals/ClockifyConnectModal.tsx": 1,
  "src/presentation/modals/ClockifyEntriesModal.tsx": 6,
  "src/presentation/modals/DeleteWorkspaceModal.tsx": 5,
  "src/presentation/modals/EditGroupModal.tsx": 3,
  "src/presentation/modals/EditPlannedTaskModal.tsx": 2,
  "src/presentation/modals/EditTaskModal.tsx": 1,
  "src/presentation/modals/ExportModal.tsx": 4,
  "src/presentation/modals/ImportCalendarModal.tsx": 5,
  "src/presentation/modals/ImportZendeskModal.tsx": 6,
  "src/presentation/modals/MondayConnectModal.tsx": 1,
  "src/presentation/modals/MondayEntriesModal.tsx": 10,
  "src/presentation/modals/MondayImportModal.tsx": 4,
  "src/presentation/modals/MoveToWorkspaceModal.tsx": 1,
  "src/presentation/modals/TaskSendModal.tsx": 5,
  "src/presentation/overlays/CompletedTasksSection.tsx": 2,
  "src/presentation/overlays/OverlayWorkspaceChip.tsx": 2,
  "src/presentation/overlays/PlannedTaskEditSheet.tsx": 2,
  "src/presentation/overlays/PlanningOverlay.tsx": 2,
  "src/presentation/overlays/PopupOverlayContent.tsx": 15,
  "src/presentation/overlays/ToastApp.tsx": 6,
  "src/presentation/pages/RetroactivePage.tsx": 10,
  "src/presentation/sections/integrations/GoogleIntegrationSection.tsx": 1,
  "src/presentation/sections/integrations/ZendeskIntegrationSection.tsx": 5,
  "src/presentation/sections/integrations/shared.tsx": 6,
  "src/presentation/sections/settings/ApiTab.tsx": 6,
  "src/presentation/sections/settings/AtualizacoesTab.tsx": 4,
  "src/presentation/sections/settings/ShortcutRow.tsx": 1,
};

function listSourceFiles(root: string): string[] {
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
