import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { useLiveConfig } from "@presentation/hooks/useLiveConfig";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/** Barramento do Tauri substituído: o teste dispara o evento na mão. */
const bus = vi.hoisted(() => ({ handlers: [] as ((e: { payload: unknown }) => void)[] }));

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn(async () => {}),
  listen: (_event: string, handler: (e: { payload: unknown }) => void) => {
    bus.handlers.push(handler);
    return Promise.resolve(() => {
      bus.handlers = bus.handlers.filter((h) => h !== handler);
    });
  },
}));

function makeRepo(stored: Record<string, unknown>): IConfigRepository {
  return {
    get: async <T,>(key: string, defaultValue: T) => (stored[key] as T) ?? defaultValue,
    loadAll: async () => stored,
    set: async () => {},
    delete: async () => {},
  };
}

function renderWithConfig(stored: Record<string, unknown>) {
  const repository = makeRepo(stored);
  return renderHook(() => useLiveConfig("showWeekend", false), {
    wrapper: ({ children }) => <ConfigProvider repository={repository}>{children}</ConfigProvider>,
  });
}

function emitConfigChanged(key: string, value: unknown) {
  bus.handlers.forEach((handler) => handler({ payload: { key, value } }));
}

describe("useLiveConfig", () => {
  it("devolve o fallback fora do provider, em vez de estourar", () => {
    // É o que deixa os primitivos de `components/ui/` serem montados sozinhos
    // no teste sem arrastar o contexto inteiro junto.
    const { result } = renderHook(() => useLiveConfig("showWeekend", false));
    expect(result.current).toBe(false);
  });

  it("devolve o valor gravado assim que a config carrega", async () => {
    const { result } = renderWithConfig({ showWeekend: true });
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("acompanha a troca feita em outra janela", async () => {
    // Sem isto o popup continuaria oferecendo cinco dias até ser reaberto: a
    // config de cada janela é o retrato do mount.
    const { result } = renderWithConfig({ showWeekend: true });
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => emitConfigChanged("showWeekend", false));
    expect(result.current).toBe(false);
  });

  it("deixa o valor gravado vencer o evento que chegou antes da carga", async () => {
    // Comportamento deliberado, não corrida perdida: a janela do evento é o
    // boot da janela, e quem vence ali é o que está no banco. Sem esta trava a
    // linha é prosa no docblock, e é exatamente o tipo de coisa que alguém
    // "conserta" invertendo a ordem dos efeitos.
    const { result } = renderWithConfig({ showWeekend: true });

    await act(async () => emitConfigChanged("showWeekend", false));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("ignora a troca de outra config", async () => {
    // O mesmo evento carrega acento, início da semana e tudo mais — sem a
    // guarda pela chave, trocar o acento desligaria o fim de semana.
    const { result } = renderWithConfig({ showWeekend: true });
    await waitFor(() => expect(result.current).toBe(true));

    await act(async () => emitConfigChanged("accent", "verde"));
    expect(result.current).toBe(true);
  });
});
