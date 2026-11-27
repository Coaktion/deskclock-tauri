import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { useOmniboxDraft } from "@presentation/hooks/useOmniboxDraft";
import type { OmniboxInterpreter } from "@presentation/hooks/omniboxTextEntry";

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
  const startTask = vi.fn(() => Promise.resolve(null));
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

// ─── O texto interpretado ─────────────────────────────────────────────────────

const SUBMITTED_AT = "2026-08-19T12:00:00.000Z";

function interpretation(over: Partial<TaskTextInterpretation> = {}): TaskTextInterpretation {
  return {
    name: "Alinhamento",
    projectId: "proj-9",
    categoryId: null,
    billable: false,
    billableExplicit: true,
    customValues: {},
    ambiguities: [],
    notFound: [],
    source: "local",
    ...over,
  };
}

/** O intérprete falso: o estado é o que o teste manda, e o `submit` devolve o que ele diz. */
function fakeInterpreter(over: Partial<OmniboxInterpreter> = {}): OmniboxInterpreter {
  return {
    status: "idle",
    interpretation: null,
    submittedAt: null,
    submit: vi.fn(() =>
      Promise.resolve({ interpretation: interpretation(), submittedAt: SUBMITTED_AT })
    ),
    dismiss: vi.fn(),
    reset: vi.fn(),
    ...over,
  };
}

function setupWithInterpreter(interpreter: OmniboxInterpreter) {
  const startTask = vi.fn(() => Promise.resolve(null));
  const hook = renderHook(
    ({ it }) => useOmniboxDraft({ plannedTasks: [], today: TODAY, startTask, interpreter: it }),
    { initialProps: { it: interpreter } }
  );
  return { hook, startTask };
}

describe("useOmniboxDraft — o Enter com o texto interpretado", () => {
  it("com texto, o primeiro Enter analisa em vez de iniciar", async () => {
    const interpreter = fakeInterpreter();
    const { hook, startTask } = setupWithInterpreter(interpreter);

    act(() => hook.result.current.changeName("Alinhamento P=acme"));
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(interpreter.submit).toHaveBeenCalledWith("Alinhamento P=acme");
    expect(startTask).not.toHaveBeenCalled();
  });

  it("o que volta só com o nome inicia direto, sem prévia", async () => {
    const interpreter = fakeInterpreter({
      submit: vi.fn(() =>
        Promise.resolve({
          interpretation: interpretation({
            projectId: null,
            billable: true,
            billableExplicit: false,
          }),
          submittedAt: SUBMITTED_AT,
        })
      ),
    });
    const { hook, startTask } = setupWithInterpreter(interpreter);

    act(() => hook.result.current.changeName("Alinhamento"));
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alinhamento", startTime: SUBMITTED_AT })
    );
    expect(interpreter.reset).toHaveBeenCalled();
  });

  it("na prévia, o Enter inicia com os campos dela e o instante do primeiro envio", async () => {
    const interpreter = fakeInterpreter();
    const { hook, startTask } = setupWithInterpreter(interpreter);
    act(() => hook.result.current.changeName("Alinhamento P=acme"));

    hook.rerender({
      it: {
        ...interpreter,
        status: "preview",
        interpretation: interpretation(),
        submittedAt: SUBMITTED_AT,
      },
    });
    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(startTask).toHaveBeenCalledWith({
      name: "Alinhamento",
      projectId: "proj-9",
      categoryId: null,
      billable: false,
      customValues: {},
      startTime: SUBMITTED_AT,
      plannedTaskId: null,
    });
    expect(interpreter.reset).toHaveBeenCalled();
    expect(hook.result.current.draft.name).toBe("");
  });

  it("depois de um erro, o segundo Enter inicia o texto como nome", async () => {
    const interpreter = fakeInterpreter({ status: "error" });
    const { hook, startTask } = setupWithInterpreter(interpreter);
    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "Alinhamento" })));

    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(interpreter.submit).not.toHaveBeenCalled();
    expect(startTask).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alinhamento", plannedTaskId: null, customValues: {} })
    );
  });

  it("campo vazio inicia na hora, sem analisar", async () => {
    const interpreter = fakeInterpreter();
    const { hook, startTask } = setupWithInterpreter(interpreter);

    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(interpreter.submit).not.toHaveBeenCalled();
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ name: null }));
  });

  it("chip escolhido à mão: o texto é só o nome, e inicia sem analisar", async () => {
    const interpreter = fakeInterpreter();
    const { hook, startTask } = setupWithInterpreter(interpreter);
    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "Daily", projectId: "proj-1" })));

    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(interpreter.submit).not.toHaveBeenCalled();
    expect(startTask).toHaveBeenCalledWith(expect.objectContaining({ projectId: "proj-1" }));
  });

  it("analisando, o Enter não faz nada — nem inicia, nem reenvia", async () => {
    const interpreter = fakeInterpreter({ status: "analyzing" });
    const { hook, startTask } = setupWithInterpreter(interpreter);
    act(() => hook.result.current.setDraft((d) => ({ ...d, name: "Alinhamento" })));

    await act(async () => hook.result.current.handleInputKeyDown(keyEvent("Enter").react));

    expect(interpreter.submit).not.toHaveBeenCalled();
    expect(startTask).not.toHaveBeenCalled();
  });

  it("editar o texto com a prévia aberta descarta a prévia; apagar, esquece o envio", () => {
    const interpreter = fakeInterpreter({ status: "preview", interpretation: interpretation() });
    const { hook } = setupWithInterpreter(interpreter);

    act(() => hook.result.current.changeName("Alinhamento P=ac"));
    expect(interpreter.dismiss).toHaveBeenCalled();

    act(() => hook.result.current.changeName(""));
    expect(interpreter.reset).toHaveBeenCalled();
  });

  it("o ESC com a prévia aberta a fecha e avisa que consumiu a tecla", () => {
    const interpreter = fakeInterpreter({ status: "preview", interpretation: interpretation() });
    const { hook } = setupWithInterpreter(interpreter);

    const esc = keyEvent("Escape");
    act(() => hook.result.current.handleInputKeyDown(esc.react));

    expect(interpreter.dismiss).toHaveBeenCalled();
    expect(esc.event.preventDefault).toHaveBeenCalled();
    expect(esc.event.stopPropagation).toHaveBeenCalled();
  });

  it("o ESC sem prévia segue subindo", () => {
    const interpreter = fakeInterpreter();
    const { hook } = setupWithInterpreter(interpreter);

    const esc = keyEvent("Escape");
    act(() => hook.result.current.handleInputKeyDown(esc.react));

    expect(interpreter.dismiss).not.toHaveBeenCalled();
    expect(esc.event.stopPropagation).not.toHaveBeenCalled();
  });
});
