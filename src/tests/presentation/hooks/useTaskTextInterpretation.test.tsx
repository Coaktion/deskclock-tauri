import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ILlmApi, LlmCompletion } from "@domain/integrations/ILlmApi";
import { LlmAuthError } from "@infra/integrations/llm/errors";
import { describeTaskTextError } from "@presentation/integrations/taskText";
import { useTaskTextInterpretation } from "@presentation/hooks/useTaskTextInterpretation";
import {
  REASON_FIELD,
  STAGE_FIELD,
  category,
  project,
} from "../../domain/usecases/llm/taskText/fixtures";

// Mock na fronteira: provedor, config e os hooks de catálogo. O hook em si —
// e o domínio que ele chama — roda de verdade.
const llm: ILlmApi = { complete: vi.fn(), listModels: vi.fn() };
const createLlmApi = vi.fn(() => llm);
let connected = true;

vi.mock("@presentation/contexts/IntegrationsContext", () => ({
  useIntegrations: () => ({ createLlmApi }),
}));
vi.mock("@presentation/contexts/ConfigContext", () => ({
  useAppConfig: () => ({
    isLoaded: true,
    get: (key: string) =>
      connected ? ({ llmBaseUrl: "http://llm", llmModel: "m" } as Record<string, string>)[key] : "",
  }),
}));

const PROJECTS = [project("p-tech", "Tech interno"), project("p-acme", "Acme Corp")];
const CATEGORIES = [category("c-dev", "Development NB", false), category("c-meet", "Meeting")];
const FIELDS = [STAGE_FIELD, REASON_FIELD];
const ROWS: never[] = [];

vi.mock("@presentation/hooks/useProjects", () => ({ useProjects: () => ({ projects: PROJECTS }) }));
vi.mock("@presentation/hooks/useCategories", () => ({
  useCategories: () => ({ categories: CATEGORIES }),
}));
vi.mock("@presentation/hooks/useCustomFields", () => ({
  useCustomFields: () => ({ fields: FIELDS }),
}));
vi.mock("@presentation/hooks/useProjectCategoryMap", () => ({
  useProjectCategoryMap: () => ({ rows: ROWS }),
}));

function deferred() {
  let resolve!: (value: LlmCompletion) => void;
  const promise = new Promise<LlmCompletion>((r) => (resolve = r));
  return { promise, resolve };
}

const T0 = new Date("2026-11-27T12:00:00.000Z");

describe("useTaskTextInterpretation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    connected = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(T0);
  });
  afterEach(() => vi.useRealTimers());

  it("texto com sigla resolve sem chamar o provedor", async () => {
    const { result } = renderHook(() => useTaskTextInterpretation());

    await act(() => result.current.submit("Alinhamento P=tech int C=dev"));

    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.current.status).toBe("preview");
    expect(result.current.interpretation).toMatchObject({
      name: "Alinhamento",
      projectId: "p-tech",
      categoryId: "c-dev",
      source: "local",
    });
  });

  it("o segundo envio mantém o instante do primeiro", async () => {
    const { result } = renderHook(() => useTaskTextInterpretation());

    await act(() => result.current.submit("Daily P=tech"));
    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    let second: Awaited<ReturnType<typeof result.current.submit>> = null;
    await act(async () => {
      second = await result.current.submit("Daily P=acme");
    });

    expect(second).toMatchObject({ submittedAt: T0.toISOString() });
    expect(result.current.submittedAt).toBe(T0.toISOString());
  });

  it("dismiss guarda o instante; reset o apaga", async () => {
    const { result } = renderHook(() => useTaskTextInterpretation());
    await act(() => result.current.submit("Daily P=tech"));

    act(() => result.current.dismiss());
    expect(result.current.status).toBe("idle");
    expect(result.current.interpretation).toBeNull();
    expect(result.current.submittedAt).toBe(T0.toISOString());

    act(() => result.current.reset());
    expect(result.current.submittedAt).toBeNull();

    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    const next = await act(() => result.current.submit("Daily P=tech"));
    expect(next?.submittedAt).toBe(new Date(T0.getTime() + 60_000).toISOString());
  });

  it("resposta de um envio anterior que chega depois é descartada", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(llm.complete).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useTaskTextInterpretation());

    let firstSubmit!: Promise<unknown>;
    let secondSubmit!: Promise<unknown>;
    act(() => {
      firstSubmit = result.current.submit("Reunião antiga");
    });
    act(() => {
      secondSubmit = result.current.submit("Reunião nova");
    });
    await act(async () => {
      second.resolve({ text: '{"name":"Reunião nova","fields":{}}' });
      await secondSubmit;
    });
    let stale: unknown;
    await act(async () => {
      first.resolve({ text: '{"name":"Reunião antiga","fields":{}}' });
      stale = await firstSubmit;
    });

    expect(stale).toBeNull();
    expect(result.current.status).toBe("preview");
    expect(result.current.interpretation?.name).toBe("Reunião nova");
  });

  it("erro do provedor vira status de erro com a frase da tela", async () => {
    const error = new LlmAuthError();
    vi.mocked(llm.complete).mockRejectedValueOnce(error);
    const { result } = renderHook(() => useTaskTextInterpretation());

    const submission = await act(() => result.current.submit("Revisar PR da Acme"));

    expect(submission).toBeNull();
    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe(describeTaskTextError(error));
    expect(result.current.interpretation).toBeNull();
    expect(result.current.submittedAt).toBe(T0.toISOString());
  });

  it("sem provedor conectado, o texto livre vira o nome e nada é chamado", async () => {
    connected = false;
    const { result } = renderHook(() => useTaskTextInterpretation());

    await act(() => result.current.submit("Revisar PR"));

    expect(result.current.connected).toBe(false);
    expect(createLlmApi).not.toHaveBeenCalled();
    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.current.interpretation).toMatchObject({ name: "Revisar PR", source: "local" });
  });

  it("choose e setBillable não fazem nada sem interpretação", () => {
    const { result } = renderHook(() => useTaskTextInterpretation());
    const before = result.current;

    act(() => result.current.choose("project", "p-acme"));
    act(() => result.current.setBillable(false));

    expect(result.current.status).toBe("idle");
    expect(result.current.interpretation).toBeNull();
    expect(result.current).toBe(before);
  });
});
