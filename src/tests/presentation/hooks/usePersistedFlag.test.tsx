import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { usePersistedFlag } from "@presentation/hooks/usePersistedFlag";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

function makeRepo(overrides: Partial<IConfigRepository> = {}): IConfigRepository {
  return {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function wrapperWith(repo: IConfigRepository) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ConfigProvider repository={repo}>{children}</ConfigProvider>;
  };
}

describe("usePersistedFlag", () => {
  it("assume false enquanto a config não carregou", () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => new Promise<Record<string, unknown>>(() => {})),
    });
    const { result } = renderHook(() => usePersistedFlag("planningFormCollapsed"), {
      wrapper: wrapperWith(repo),
    });

    expect(result.current.value).toBe(false);
  });

  it("adota o valor gravado assim que a config carrega", async () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => Promise.resolve({ planningFormCollapsed: true })),
    });
    const { result } = renderHook(() => usePersistedFlag("planningFormCollapsed"), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.value).toBe(true));
  });

  it("toggle inverte o estado local e persiste na config", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => usePersistedFlag("retroactiveFormCollapsed"), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.value).toBe(false));

    act(() => result.current.toggle());

    expect(result.current.value).toBe(true);
    expect(repo.set).toHaveBeenCalledWith("retroactiveFormCollapsed", true);

    act(() => result.current.toggle());

    expect(result.current.value).toBe(false);
    expect(repo.set).toHaveBeenLastCalledWith("retroactiveFormCollapsed", false);
  });

  it("set grava o valor pedido mesmo quando já é o atual", async () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => Promise.resolve({ retroactiveFormCollapsed: true })),
    });
    const { result } = renderHook(() => usePersistedFlag("retroactiveFormCollapsed"), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.value).toBe(true));

    act(() => result.current.set(false));

    expect(result.current.value).toBe(false);
    expect(repo.set).toHaveBeenCalledWith("retroactiveFormCollapsed", false);
  });
});
