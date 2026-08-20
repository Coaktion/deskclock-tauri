import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Task } from "@domain/entities/Task";
import type { CustomValues } from "@domain/entities/CustomField";
import { useRunningCustomFields } from "@presentation/hooks/useRunningCustomFields";
import { localISO } from "../../helpers/localTime";

function makeTask(customValues: CustomValues): Task {
  return {
    id: "t1",
    workspaceId: "ws1",
    name: "Reunião",
    projectId: null,
    categoryId: null,
    billable: true,
    startTime: localISO(2026, 8, 6, 9),
    endTime: null,
    durationSeconds: null,
    status: "running",
    createdAt: localISO(2026, 8, 6, 9),
    updatedAt: localISO(2026, 8, 6, 9),
    customValues,
  };
}

describe("useRunningCustomFields", () => {
  it("semeia os valores da tarefa", () => {
    const { result } = renderHook(() =>
      useRunningCustomFields({
        task: makeTask({ stage: "opt-1" }),
        onSave: vi.fn(),
        onClose: vi.fn(),
      })
    );
    expect(result.current.values).toEqual({ stage: "opt-1" });
  });

  it("não ressincroniza quando a tarefa muda por fora — o que está sendo digitado fica", () => {
    const { result, rerender } = renderHook(
      ({ task }) => useRunningCustomFields({ task, onSave: vi.fn(), onClose: vi.fn() }),
      { initialProps: { task: makeTask({ stage: "opt-1" }) } }
    );

    act(() => result.current.setValues({ stage: "opt-2" }));
    // Outra janela pausou a tarefa: chega uma Task nova, com os valores antigos.
    rerender({ task: makeTask({ stage: "opt-1" }) });

    expect(result.current.values).toEqual({ stage: "opt-2" });
  });

  it("salva os valores em edição e fecha", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useRunningCustomFields({ task: makeTask({}), onSave, onClose })
    );

    act(() => result.current.setValues({ stage: "opt-3" }));
    await act(() => result.current.save());

    expect(onSave).toHaveBeenCalledWith({ stage: "opt-3" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("não fecha quando a gravação falha — o texto digitado continua na tela", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("banco fora"));
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useRunningCustomFields({ task: makeTask({}), onSave, onClose })
    );

    await act(async () => {
      await expect(result.current.save()).rejects.toThrow("banco fora");
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);
  });
});
