import { createRef, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { OmniboxIdle } from "@presentation/components/OmniboxIdle";

/**
 * O único provider que a lista pede: o mapa projeto↔categoria abre o banco e
 * escuta evento do Tauri. Mockar o hook é uma linha; montar o
 * `RepositoriesContext` seria montar o app para clicar num círculo.
 */
vi.mock("@presentation/hooks/useProjectCategoryMap", () => ({
  useProjectCategoryMap: () => ({ categoriesFor: () => [] }),
}));

afterEach(cleanup);

const DAY = "2026-04-08";

function makeTask(overrides: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Revisão de PRs",
    projectId: null,
    categoryId: null,
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: DAY,
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: "2026-04-08T09:00:00.000Z",
    customValues: {},
    ...overrides,
  };
}

type Props = ComponentProps<typeof OmniboxIdle>;

function renderIdle(overrides: Partial<Props> = {}) {
  const props: Props = {
    projects: [],
    categories: [],
    containerRef: createRef<HTMLDivElement>(),
    onToggleBillable: vi.fn(),
    onCompletePlanned: vi.fn(),
    draft: {
      name: "",
      projectName: "",
      projectId: null,
      categoryName: "",
      categoryId: null,
      billable: true,
    },
    setDraft: vi.fn(),
    focused: false,
    setFocused: vi.fn(),
    showSuggestions: true,
    setShowSuggestions: vi.fn(),
    activeSuggIdx: 0,
    setActiveSuggIdx: vi.fn(),
    editingChip: null,
    setEditingChip: vi.fn(),
    inputRef: createRef<HTMLInputElement>(),
    suggestions: [makeTask()],
    startPlanned: vi.fn(() => Promise.resolve()),
    handleStart: vi.fn(() => Promise.resolve()),
    handleInputKeyDown: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
  render(<OmniboxIdle {...props} />);
  return props;
}

const circle = () => screen.getByRole("button", { name: "Concluir" });
const row = () => screen.getByText("Revisão de PRs").closest(".group") as HTMLElement;

describe("OmniboxIdle — planejadas de hoje", () => {
  it("o círculo conclui a planejada do dia", () => {
    const props = renderIdle();
    fireEvent.click(circle());
    expect(props.onCompletePlanned).toHaveBeenCalledWith(props.suggestions[0]);
  });

  it("clicar no círculo não inicia a tarefa", () => {
    const props = renderIdle();
    fireEvent.click(circle());
    expect(props.startPlanned).not.toHaveBeenCalled();
  });

  it("clicar na linha continua iniciando a tarefa", () => {
    const props = renderIdle();
    fireEvent.click(row());
    expect(props.startPlanned).toHaveBeenCalledWith(props.suggestions[0]);
    expect(props.onCompletePlanned).not.toHaveBeenCalled();
  });

  it("o círculo nasce vazio: só pendente chega a esta lista", () => {
    renderIdle();
    expect(circle().getAttribute("aria-pressed")).toBe("false");
  });
});
