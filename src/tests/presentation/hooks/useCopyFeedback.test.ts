import { useCopyFeedback } from "@presentation/hooks/useCopyFeedback";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useCopyFeedback", () => {
  it("escreve o texto e liga copied por 2 segundos", async () => {
    const { result } = renderHook(() => useCopyFeedback());
    expect(result.current.copied).toBe(false);

    await act(() => result.current.copy("abc"));
    expect(writeText).toHaveBeenCalledWith("abc");
    expect(result.current.copied).toBe(true);

    act(() => vi.advanceTimersByTime(1999));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.copied).toBe(false);
  });

  it("copiar de novo antes do fim reinicia a contagem", async () => {
    const { result } = renderHook(() => useCopyFeedback());
    await act(() => result.current.copy("a"));
    act(() => vi.advanceTimersByTime(1500));
    await act(() => result.current.copy("b"));
    act(() => vi.advanceTimersByTime(1500));
    expect(result.current.copied).toBe(true);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.copied).toBe(false);
  });

  it("desmontar limpa o timer pendente", async () => {
    const { result, unmount } = renderHook(() => useCopyFeedback());
    await act(() => result.current.copy("a"));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falha de escrita propaga e não liga copied", async () => {
    writeText.mockRejectedValueOnce(new Error("negado"));
    const { result } = renderHook(() => useCopyFeedback());
    await act(async () => {
      await expect(result.current.copy("x")).rejects.toThrow("negado");
    });
    expect(result.current.copied).toBe(false);
  });
});
