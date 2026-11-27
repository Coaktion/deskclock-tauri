import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";
import { useRetroactiveEntryMode } from "@presentation/hooks/useRetroactiveEntryMode";
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

describe("retroactiveEntryMode", () => {
  it("o padrão da config é o formulário", async () => {
    const { result } = renderHook(() => useAppConfig(), { wrapper: wrapperWith(makeRepo()) });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.get("retroactiveEntryMode")).toBe("form");
  });
});

describe("useRetroactiveEntryMode", () => {
  it("abre no formulário enquanto a config não carregou", () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => new Promise<Record<string, unknown>>(() => {})),
    });
    const { result } = renderHook(() => useRetroactiveEntryMode(), {
      wrapper: wrapperWith(repo),
    });

    expect(result.current.mode).toBe("form");
  });

  it("adota a aba gravada assim que a config carrega", async () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => Promise.resolve({ retroactiveEntryMode: "ai" })),
    });
    const { result } = renderHook(() => useRetroactiveEntryMode(), {
      wrapper: wrapperWith(repo),
    });

    await waitFor(() => expect(result.current.mode).toBe("ai"));
  });

  it("trocar de aba muda o estado local e grava na config", async () => {
    const repo = makeRepo();
    const { result } = renderHook(() => useRetroactiveEntryMode(), {
      wrapper: wrapperWith(repo),
    });
    await waitFor(() => expect(repo.loadAll).toHaveBeenCalled());

    act(() => result.current.setMode("ai"));

    expect(result.current.mode).toBe("ai");
    expect(repo.set).toHaveBeenCalledWith("retroactiveEntryMode", "ai");
  });
});
