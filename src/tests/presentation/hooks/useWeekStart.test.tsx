import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { useWeekStart } from "@presentation/hooks/useWeekStart";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
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
  return renderHook(() => useWeekStart(), {
    wrapper: ({ children }) => <ConfigProvider repository={repository}>{children}</ConfigProvider>,
  });
}

function emitConfigChanged(key: string, value: unknown) {
  bus.handlers.forEach((handler) => handler({ payload: { key, value } }));
}

describe("useWeekStart", () => {
  it("devolve segunda fora do provider, em vez de estourar", () => {
    // É o que deixa os primitivos de `components/ui/` serem montados sozinhos
    // no teste sem arrastar o contexto inteiro junto.
    const { result } = renderHook(() => useWeekStart());
    expect(result.current).toBe(1);
  });

  it("devolve o valor gravado assim que a config carrega", async () => {
    const { result } = renderWithConfig({ weekStartsOn: 0 });
    await waitFor(() => expect(result.current).toBe(0));
  });

  it("acompanha a troca feita em outra janela", async () => {
    // Sem isto o overlay contaria a semana antiga até ser reaberto: a config de
    // cada janela é o retrato do mount.
    //
    // O gravado é **domingo** de propósito: é o que torna a carga observável.
    // Com segunda gravada, o valor inicial e o carregado são iguais, o `waitFor`
    // passa antes de a config ter carregado e a leitura inicial desfaz o evento
    // logo depois — o teste reprovava por isso, não por defeito do hook.
    const { result } = renderWithConfig({ weekStartsOn: 0 });
    await waitFor(() => expect(result.current).toBe(0));

    await act(async () => emitConfigChanged("weekStartsOn", 1));
    expect(result.current).toBe(1);
  });

  it("ignora a troca de outra config", async () => {
    // O mesmo evento carrega acento, opacidade do overlay e tudo mais — sem a
    // guarda pela chave, trocar o acento zeraria o início da semana.
    const { result } = renderWithConfig({ weekStartsOn: 0 });
    await waitFor(() => expect(result.current).toBe(0));

    await act(async () => emitConfigChanged("accent", "verde"));
    expect(result.current).toBe(0);
  });
});
