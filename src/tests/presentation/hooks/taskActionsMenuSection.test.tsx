import { describe, expect, it, vi } from "vitest";

import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { MENU_DIVIDER, type MenuItem } from "@presentation/components/ui";
import { taskActionsMenuSection } from "@presentation/hooks/taskActionsMenuSection";

const openInBrowser = vi.fn();
const openInFileManager = vi.fn();
vi.mock("@shared/utils/shell", () => ({
  openInBrowser: (url: string) => openInBrowser(url),
  openInFileManager: (path: string) => openInFileManager(path),
}));

const url: PlannedTaskAction = { type: "open_url", value: "https://meet.google.com/abc" };
const file: PlannedTaskAction = { type: "open_file", value: "/home/eduardo/ata.md" };

const items = (entries: ReturnType<typeof taskActionsMenuSection>) =>
  entries.filter((e): e is MenuItem => e !== MENU_DIVIDER);

/**
 * A seção que o ⚡ virou (H1). Os três casos são os do próprio ⚡: nada a
 * mostrar, a ação única que se executa direto, e a escolha — que ali era painel
 * e aqui é submenu.
 */
describe("taskActionsMenuSection", () => {
  it("sem ação, não soma nada — nem o divisor", () => {
    expect(taskActionsMenuSection([])).toEqual([]);
  });

  it("com uma ação, o item é a própria ação e executa direto", () => {
    const entries = taskActionsMenuSection([url]);
    // A seção abre o menu, e o divisor fecha ela.
    expect(entries[entries.length - 1]).toBe(MENU_DIVIDER);
    const [item] = items(entries);
    expect(item.label).toBe("Abrir Meet");
    expect(item.children).toBeUndefined();

    item.onSelect?.();
    expect(openInBrowser).toHaveBeenCalledWith("https://meet.google.com/abc");
  });

  it("com mais de uma, o item é 'Ações' e as ações são os filhos", () => {
    const entries = taskActionsMenuSection([url, file]);
    expect(entries[entries.length - 1]).toBe(MENU_DIVIDER);
    const [item] = items(entries);
    expect(item.label).toBe("Ações");
    // O rótulo de cada filho é o do chip: destino por extenso, nome do arquivo.
    expect(item.children?.map((c) => c.label)).toEqual(["Meet", "ata.md"]);
    // O pai não age — quem age é o filho escolhido.
    expect(item.onSelect).toBeUndefined();

    item.children?.[1].onSelect?.();
    expect(openInFileManager).toHaveBeenCalledWith("/home/eduardo/ata.md");
  });
});
