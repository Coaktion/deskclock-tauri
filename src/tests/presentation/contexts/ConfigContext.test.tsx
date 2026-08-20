import { describe, it, expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { ConfigProvider, useAppConfig } from "@presentation/contexts/ConfigContext";

function makeRepo(overrides: Partial<IConfigRepository> = {}): IConfigRepository {
  return {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe("ConfigContext", () => {
  it("lança erro quando usado fora do provider", () => {
    expect(() => renderHook(() => useAppConfig())).toThrow(
      "useAppConfig must be inside ConfigProvider"
    );
  });

  it("retorna defaults antes do load completar", () => {
    const repo = makeRepo({
      get: vi.fn(() => new Promise(() => {})) as unknown as IConfigRepository["get"],
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider repository={repo}>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useAppConfig(), { wrapper });

    expect(result.current.isLoaded).toBe(false);
    expect(result.current.get("theme")).toBe("azul");
  });

  it("marca isLoaded após carregar e retorna valor do repo", async () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => Promise.resolve({ accent: "verde" })),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider repository={repo}>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.get("accent")).toBe("verde");
  });

  it("set() atualiza cache e propaga ao repo", async () => {
    const repo = makeRepo();
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider repository={repo}>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));

    await act(async () => {
      await result.current.set("accent", "roxo");
    });

    expect(result.current.get("accent")).toBe("roxo");
    expect(repo.set).toHaveBeenCalledWith("accent", "roxo");
  });

  it("popula loadError se o repo rejeitar", async () => {
    const repo = makeRepo({
      loadAll: vi.fn(() => Promise.reject(new Error("db offline"))),
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ConfigProvider repository={repo}>{children}</ConfigProvider>
    );
    const { result } = renderHook(() => useAppConfig(), { wrapper });

    await waitFor(() => expect(result.current.isLoaded).toBe(true));
    expect(result.current.loadError).toBe("db offline");
  });
});
