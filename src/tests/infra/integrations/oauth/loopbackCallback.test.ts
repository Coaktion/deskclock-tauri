import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AUTH_TIMEOUT_MS, openOAuthCallback } from "@infra/integrations/oauth/loopbackCallback";

type Payload = { session: number; code: string | null; error: string | null };

const bus = vi.hoisted(() => ({
  handlers: [] as ((event: { payload: Payload }) => void)[],
  unlisten: vi.fn(),
  invoke: vi.fn(),
  openInBrowser: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: bus.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: Payload }) => void) => {
    bus.handlers.push(handler);
    return bus.unlisten;
  }),
}));
vi.mock("@shared/utils/shell", () => ({ openInBrowser: bus.openInBrowser }));

function emit(payload: Payload) {
  bus.handlers.forEach((handler) => handler({ payload }));
}

// Deixa o `await listen` e o `openInBrowser` rodarem antes do retorno chegar.
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  bus.handlers.length = 0;
  bus.unlisten.mockReset();
  bus.invoke.mockReset().mockResolvedValue({ port: 27422, session: 7 });
  bus.openInBrowser.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("openOAuthCallback", () => {
  it("pede a porta fixa ao Rust e monta a redirect URI com ela", async () => {
    const callback = await openOAuthCallback("Zendesk", 27422);

    expect(bus.invoke).toHaveBeenCalledWith("start_oauth_server", { port: 27422 });
    expect(callback.redirectUri).toBe("http://localhost:27422/callback");
  });

  it("sem porta, usa a porta aleatória devolvida pelo Rust", async () => {
    bus.invoke.mockResolvedValue({ port: 51234, session: 1 });

    const callback = await openOAuthCallback("Google");

    expect(bus.invoke).toHaveBeenCalledWith("start_oauth_server", {});
    expect(callback.redirectUri).toBe("http://localhost:51234/callback");
  });

  it("porta ocupada por outro programa vira mensagem clara", async () => {
    bus.invoke.mockRejectedValue("port_in_use: Address already in use (os error 98)");

    await expect(openOAuthCallback("Zendesk", 27422)).rejects.toThrow(
      "A porta 27422, usada no retorno do Zendesk, está ocupada por outro programa."
    );
  });

  it("outra falha ao subir o servidor mantém o detalhe do Rust", async () => {
    bus.invoke.mockRejectedValue("permission denied");

    await expect(openOAuthCallback("Zendesk", 27422)).rejects.toThrow(
      "Não foi possível iniciar o retorno da autorização do Zendesk: permission denied"
    );
  });
});

describe("waitForCode", () => {
  it("resolve com o code da própria sessão e para de ouvir", async () => {
    const callback = await openOAuthCallback("Zendesk", 27422);
    const code = callback.waitForCode("https://x.zendesk.com/oauth");
    await flush();

    emit({ session: 7, code: "abc", error: null });

    await expect(code).resolves.toBe("abc");
    expect(bus.openInBrowser).toHaveBeenCalledWith("https://x.zendesk.com/oauth");
    expect(bus.unlisten).toHaveBeenCalledTimes(1);
  });

  it("ignora o retorno de outra sessão", async () => {
    const callback = await openOAuthCallback("Zendesk", 27422);
    const code = callback.waitForCode("https://x");
    await flush();

    emit({ session: 6, code: "antigo", error: null });
    emit({ session: 7, code: "novo", error: null });

    await expect(code).resolves.toBe("novo");
  });

  it("rejeita na hora com a mensagem de erro do provedor", async () => {
    const callback = await openOAuthCallback("Zendesk", 27422);
    const code = callback.waitForCode("https://x");
    await flush();

    emit({ session: 7, code: null, error: "O usuário negou (access_denied)" });

    await expect(code).rejects.toThrow(
      "O Zendesk recusou a autorização: O usuário negou (access_denied)"
    );
    expect(bus.unlisten).toHaveBeenCalledTimes(1);
  });

  it("rejeita quando o browser não abre", async () => {
    bus.openInBrowser.mockRejectedValue("sem browser");
    const callback = await openOAuthCallback("Zendesk", 27422);

    await expect(callback.waitForCode("https://x")).rejects.toThrow(
      "Não foi possível abrir o browser: sem browser"
    );
    expect(bus.unlisten).toHaveBeenCalledTimes(1);
  });

  it("rejeita por timeout quando nada volta", async () => {
    vi.useFakeTimers();
    const callback = await openOAuthCallback("Zendesk", 27422);
    const code = callback.waitForCode("https://x");
    const assertion = expect(code).rejects.toThrow(
      "Timeout: autorização não concluída em 5 minutos."
    );

    await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);

    await assertion;
    expect(bus.unlisten).toHaveBeenCalledTimes(1);
  });
});
