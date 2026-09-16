import { describe, it, expect, vi, beforeEach } from "vitest";
import { startZendeskOAuth } from "@infra/integrations/zendesk/ZendeskOAuth";

type Payload = { session: number; code: string | null; error: string | null };
type Handler = (event: { payload: Payload }) => void;

const bus = vi.hoisted(() => ({
  handlers: [] as Handler[],
  invoke: vi.fn(),
  // Simula o redirect: o que o browser "recebe" ao abrir a URL.
  onOpen: (() => {}) as () => void,
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: bus.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (_event: string, handler: Handler) => {
    bus.handlers.push(handler);
    return () => {};
  }),
}));
vi.mock("@shared/utils/shell", () => ({
  openInBrowser: vi.fn(async () => bus.onOpen()),
}));

const emit = (payload: Payload) => bus.handlers.forEach((handler) => handler({ payload }));

function route(tokenResponse: unknown) {
  bus.invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "start_oauth_server") return { port: 27422, session: 3 };
    if (cmd === "post_form_json") return tokenResponse;
    if (cmd === "get_bearer_json") {
      return { status: 200, body: { user: { email: "eu@aktie.com" } } };
    }
    throw new Error(`comando inesperado: ${cmd}`);
  });
}

beforeEach(() => {
  bus.handlers.length = 0;
  bus.invoke.mockReset();
  bus.onOpen = () => emit({ session: 3, code: "c0de", error: null });
});

describe("startZendeskOAuth", () => {
  it("troca o code recebido pelos tokens usando a redirect URI da porta fixa", async () => {
    route({ status: 200, body: { access_token: "tok", refresh_token: "ref", expires_in: 3600 } });

    const tokens = await startZendeskOAuth("acme", "client", "secret");

    expect(tokens).toEqual({
      access_token: "tok",
      refresh_token: "ref",
      expires_in: 3600,
      email: "eu@aktie.com",
    });
    expect(bus.invoke).toHaveBeenCalledWith("start_oauth_server", { port: 27422 });
    const [, args] = bus.invoke.mock.calls.find(([cmd]) => cmd === "post_form_json")!;
    expect(args).toMatchObject({
      url: "https://acme.zendesk.com/oauth/tokens",
      params: {
        code: "c0de",
        client_secret: "secret",
        redirect_uri: "http://localhost:27422/callback",
        grant_type: "authorization_code",
      },
    });
  });

  it("rejeita com o erro devolvido pelo Zendesk no redirect, sem trocar code", async () => {
    route({ status: 200, body: {} });
    bus.onOpen = () =>
      emit({ session: 3, code: null, error: "Redirect URI inválida (invalid_request)" });

    await expect(startZendeskOAuth("acme", "client", "secret")).rejects.toThrow(
      "O Zendesk recusou a autorização: Redirect URI inválida (invalid_request)"
    );
    expect(bus.invoke).not.toHaveBeenCalledWith("post_form_json", expect.anything());
  });

  it("rejeita com mensagem clara quando a porta está ocupada por outro programa", async () => {
    bus.invoke.mockRejectedValue("port_in_use: Address already in use (os error 98)");

    await expect(startZendeskOAuth("acme", "client", "secret")).rejects.toThrow(
      "A porta 27422, usada no retorno do Zendesk, está ocupada por outro programa."
    );
  });

  it("repassa o error_description da troca do code", async () => {
    route({ status: 401, body: { error: "invalid_client", error_description: "Client inválido" } });

    await expect(startZendeskOAuth("acme", "client", "errado")).rejects.toThrow("Client inválido");
  });

  it("falha da troca com corpo que não é JSON mostra o status, não um TypeError", async () => {
    route({ status: 500, body: null });

    await expect(startZendeskOAuth("acme", "client", "secret")).rejects.toThrow(
      "Falha ao trocar o código de autorização (HTTP 500)."
    );
  });

  it("resposta 200 sem access_token é falha, com o status na mensagem", async () => {
    route({ status: 200, body: {} });

    await expect(startZendeskOAuth("acme", "client", "secret")).rejects.toThrow(
      "Falha ao trocar o código de autorização (HTTP 200)."
    );
    expect(bus.invoke).not.toHaveBeenCalledWith("get_bearer_json", expect.anything());
  });
});
