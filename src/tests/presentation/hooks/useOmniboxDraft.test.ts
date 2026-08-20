import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";

const TODAY = "2026-08-19";

function planned(name: string, over: Partial<PlannedTask> = {}): PlannedTask {
  return {
    id: `pt-${name}`,
    workspaceId: "ws-1",
    name,
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    scheduleType: "specific_date",
    scheduleDate: TODAY,
    recurringDays: null,
    periodStart: null,
    periodEnd: null,
    completedDates: [],
    actions: [],
    sortOrder: 0,
    createdAt: `${TODAY}T09:00:00.000Z`,
    customValues: { ticket: "AKT-1" },
    ...over,
  };
}

/** O evento de teclado como o campo o entrega — só o que o hook lê dele. */
function keyEvent(key: string) {
  const event = { key, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  return {
    event,
    react: event as unknown as React.KeyboardEvent<HTMLInputElement>,
  };
}

function setup(tasks: PlannedTask[] = [planned("Daily do time"), planned("Revisão do fluxo")]) {
  const startTask = vi.fn(() => Promise.resolve());
  const onStarted = vi.fn();
  const hook = renderHook(() =>
    useOmniboxDraft({ plannedTasks: tasks, today: TODAY, startTask, onStarted })
  );
  return { hook, startTask, onStarted };
}

describe("useOmniboxDraft — a lista de planejadas", () => {
  it("sugere as pendentes do dia e recorta pelo que foi digitado", () => {
    const { hook } = setup([
      planned("Daily do time"),
      planned("Revisão do fluxo"),
      planned("Já feita", { completedDates: [TODAY] }),
    ]);

    expect(hook.result.current.suggestions.map((t) => t.name)).toEqual([
      "Daily do time",
      "Revisão do fluxo",
    ]);

    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "daily" })));
    expect(hook.result.current.suggestions.map((t) => t.name)).toEqual(["Daily do time"]);
  });

  it("as setas andam pela lista sem sair dela", () => {
    const { hook } = setup();

    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowDown").react));
    expect(hook.result.current.activeSuggIdx).toBe(1);

    // Já no fim: a seta não passa do último.
    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowDown").react));
    expect(hook.result.current.activeSuggIdx).toBe(1);

    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowUp").react));
    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowUp").react));
    expect(hook.result.current.activeSuggIdx).toBe(0);
  });

  it("digitar devolve o índice ativo ao topo — a lista se reordenou", () => {
    const { hook } = setup();

    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowDown").react));
    expect(hook.result.current.activeSuggIdx).toBe(1);

    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "d" })));
    expect(hook.result.current.activeSuggIdx).toBe(0);
  });
});

describe("useOmniboxDraft — o que o Enter dispara", () => {
  it("com a lista aberta, inicia a planejada ativa com o vínculo e os campos dela", async () => {
    const { hook, startTask, onStarted } = setup();

    act(() => hook.result.current.setShowSuggestions(true));
    act(() => hook.result.current.handleInputKeyDown(keyEvent("ArrowDown").react));
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(startTask).toHaveBeenCalledWith({
      name: "Revisão do fluxo",
      projectId: "proj-1",
      categoryId: "cat-1",
      billable: true,
      plannedTaskId: "pt-Revisão do fluxo",
      customValues: { ticket: "AKT-1" },
    });
    expect(onStarted).toHaveBeenCalled();
    expect(hook.result.current.showSuggestions).toBe(false);
  });

  it("com a lista fechada, inicia o rascunho — tarefa avulsa, sem vínculo", async () => {
    const { hook, startTask } = setup();

    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "  Algo novo  " })));
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Algo novo", plannedTaskId: null, customValues: {} })
    );
  });

  it("lista aberta e sem correspondência cai no rascunho, não na planejada", async () => {
    const { hook, startTask } = setup();

    act(() => hook.result.current.setShowSuggestions(true));
    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "zzz" })));
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: "zzz", plannedTaskId: null })
    );
  });
});

describe("useOmniboxDraft — o ESC", () => {
  it("fecha a lista e avisa que consumiu a tecla", () => {
    const { hook } = setup();
    act(() => hook.result.current.setShowSuggestions(true));

    const esc = keyEvent("Escape");
    act(() => hook.result.current.handleInputKeyDown(esc.react));

    expect(hook.result.current.showSuggestions).toBe(false);
    expect(esc.event.preventDefault).toHaveBeenCalled();
    expect(esc.event.stopPropagation).toHaveBeenCalled();
  });

  it("com a lista fechada, deixa o ESC subir — quem fecha a janela é de cima", () => {
    const { hook } = setup();

    const esc = keyEvent("Escape");
    act(() => hook.result.current.handleInputKeyDown(esc.react));

    expect(esc.event.stopPropagation).not.toHaveBeenCalled();
  });
});
