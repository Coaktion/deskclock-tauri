import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";

describe("useMultiSelect", () => {
  it("alterna a seleção de um id", () => {
    const { result } = renderHook(() => useMultiSelect(["a", "b", "c"]));

    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(true);
    expect(result.current.count).toBe(1);

    act(() => result.current.toggle("b"));
    expect(result.current.isSelected("b")).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it("ignora ids que saíram da lista visível", () => {
    const { result, rerender } = renderHook(({ ids }) => useMultiSelect(ids), {
      initialProps: { ids: ["a", "b"] },
    });

    act(() => result.current.toggle("a"));
    act(() => result.current.toggle("b"));
    expect(result.current.count).toBe(2);

    // O filtro esconde "a": ele não pode contar nem ser excluído.
    rerender({ ids: ["b"] });
    expect(result.current.count).toBe(1);
    expect(result.current.isSelected("a")).toBe(false);
    expect([...result.current.selected]).toEqual(["b"]);
  });

  it("allSelected considera apenas o que está visível", () => {
    const { result, rerender } = renderHook(({ ids }) => useMultiSelect(ids), {
      initialProps: { ids: ["a", "b"] },
    });

    act(() => result.current.toggle("a"));
    expect(result.current.allSelected).toBe(false);

    rerender({ ids: ["a"] });
    expect(result.current.allSelected).toBe(true);
  });

  it("toggleAll marca tudo quando a seleção é parcial e desmarca quando é total", () => {
    const { result } = renderHook(() => useMultiSelect(["a", "b", "c"]));

    act(() => result.current.toggle("a"));
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(3);

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
  });

  it("toggleAll com filtro ativo não mexe no que está escondido", () => {
    const { result, rerender } = renderHook(({ ids }) => useMultiSelect(ids), {
      initialProps: { ids: ["a", "b", "c"] },
    });

    act(() => result.current.toggle("a"));

    // Filtra para "b" e "c" e marca ambos.
    rerender({ ids: ["b", "c"] });
    act(() => result.current.toggleAll());
    expect([...result.current.selected].sort()).toEqual(["b", "c"]);

    // Desmarcar tudo aqui não pode ressuscitar nem apagar a marcação de "a".
    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);

    rerender({ ids: ["a", "b", "c"] });
    expect([...result.current.selected]).toEqual(["a"]);
  });

  it("unselect remove apenas os ids informados", () => {
    const { result } = renderHook(() => useMultiSelect(["a", "b", "c"]));

    act(() => result.current.toggleAll());
    act(() => result.current.unselect(["a", "c"]));
    expect([...result.current.selected]).toEqual(["b"]);
  });

  it("clear zera a seleção inteira", () => {
    const { result } = renderHook(() => useMultiSelect(["a", "b"]));

    act(() => result.current.toggleAll());
    act(() => result.current.clear());
    expect(result.current.count).toBe(0);
  });

  it("toggleAll é inócuo quando não há nada visível", () => {
    const { result } = renderHook(() => useMultiSelect([]));

    act(() => result.current.toggleAll());
    expect(result.current.count).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });
});
