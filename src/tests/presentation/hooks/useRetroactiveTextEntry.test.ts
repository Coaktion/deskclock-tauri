import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import type { TaskTextStatus } from "@presentation/hooks/useTaskTextInterpretation";
import { rawTextWhat, useRetroactiveTextEntry } from "@presentation/hooks/useRetroactiveTextEntry";

const interpreter = {
  status: "idle" as TaskTextStatus,
  interpretation: null as TaskTextInterpretation | null,
  submittedAt: null as string | null,
  submit: vi.fn(),
  dismiss: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@presentation/hooks/useTaskTextInterpretation", () => ({
  useTaskTextInterpretation: () => interpreter,
}));

function interpretation(overrides: Partial<TaskTextInterpretation> = {}): TaskTextInterpretation {
  return {
    name: "Alinhamento",
    projectId: "p-1",
    categoryId: null,
    billable: true,
    billableExplicit: false,
    customValues: {},
    ambiguities: [],
    notFound: [],
    source: "local",
    ...overrides,
  };
}

function renderEntry(added = true) {
  const form = {
    applyInterpretation: vi.fn(),
    handleAdd: vi.fn(async () => added),
  };
  const hook = renderHook(() => useRetroactiveTextEntry(form));
  return { form, ...hook };
}

describe("rawTextWhat", () => {
  it("o texto aparado vira o nome, e o resto fica vazio", () => {
    expect(rawTextWhat("  Daily  ")).toEqual({
      name: "Daily",
      projectId: null,
      categoryId: null,
      billable: true,
      customValues: {},
    });
    expect(rawTextWhat("   ").name).toBeNull();
  });
});

describe("useRetroactiveTextEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    interpreter.status = "idle";
    interpreter.interpretation = null;
    interpreter.submittedAt = null;
  });

  it("texto sem prévia analisa e não lança enquanto há o que conferir", async () => {
    interpreter.submit.mockResolvedValue({
      interpretation: interpretation(),
      submittedAt: "2026-11-27T10:00:00Z",
    });
    const { result, form } = renderEntry();
    act(() => result.current.changeText("Alinhamento P=tech"));

    await act(() => result.current.submit());

    expect(interpreter.submit).toHaveBeenCalledWith("Alinhamento P=tech");
    expect(form.handleAdd).not.toHaveBeenCalled();
  });

  it("resultado só com nome lança direto, com o fim da duração e sem o startTime do envio", async () => {
    interpreter.submit.mockResolvedValue({
      interpretation: interpretation({ projectId: null }),
      submittedAt: "2026-11-27T10:00:00Z",
    });
    const { result, form } = renderEntry();
    act(() => result.current.changeText("Alinhamento"));

    await act(() => result.current.submit("11:30"));

    expect(form.applyInterpretation).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alinhamento", projectId: null })
    );
    expect(form.handleAdd).toHaveBeenCalledWith("11:30", expect.anything());
    expect(result.current.text).toBe("");
    expect(interpreter.reset).toHaveBeenCalled();
  });

  it("com a prévia aberta, o submit lança o que ela mostra e limpa o texto", async () => {
    interpreter.status = "preview";
    interpreter.interpretation = interpretation();
    interpreter.submittedAt = "2026-11-27T10:00:00Z";
    const { result, form } = renderEntry();
    act(() => result.current.changeText("Alinhamento P=tech"));
    interpreter.dismiss.mockClear();

    await act(() => result.current.submit());

    expect(form.handleAdd).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ projectId: "p-1" })
    );
    expect(result.current.text).toBe("");
    expect(interpreter.reset).toHaveBeenCalled();
  });

  it("erro na análise: o submit lança o texto cru como nome", async () => {
    interpreter.status = "error";
    const { result, form } = renderEntry();
    act(() => result.current.changeText("Daily"));

    await act(() => result.current.submit());

    expect(form.handleAdd).toHaveBeenCalledWith(undefined, rawTextWhat("Daily"));
  });

  it("lançamento recusado pelo domínio mantém o texto e a prévia", async () => {
    interpreter.status = "preview";
    interpreter.interpretation = interpretation();
    interpreter.submittedAt = "2026-11-27T10:00:00Z";
    const { result } = renderEntry(false);
    act(() => result.current.changeText("Alinhamento P=tech"));

    await act(() => result.current.submit());

    expect(result.current.text).toBe("Alinhamento P=tech");
    expect(interpreter.reset).not.toHaveBeenCalled();
  });

  it("ESC com prévia fecha e consome a tecla; sem prévia, deixa passar", () => {
    const { result, rerender } = renderEntry();
    const idleEvent = {
      key: "Escape",
      defaultPrevented: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
    result.current.handleKeyDown(idleEvent as unknown as React.KeyboardEvent);
    expect(idleEvent.preventDefault).not.toHaveBeenCalled();

    interpreter.status = "preview";
    rerender();
    const previewEvent = { ...idleEvent, preventDefault: vi.fn(), stopPropagation: vi.fn() };
    result.current.handleKeyDown(previewEvent as unknown as React.KeyboardEvent);

    expect(interpreter.dismiss).toHaveBeenCalled();
    expect(previewEvent.preventDefault).toHaveBeenCalled();
  });
});
