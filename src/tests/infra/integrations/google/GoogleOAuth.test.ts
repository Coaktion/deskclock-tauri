import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startGoogleOAuth } from "@infra/integrations/google/GoogleOAuth";

type Payload = { session: number; code: string | null; error: string | null };
type Handler = (event: { payload: Payload }) => void;

const bus = vi.hoisted(() => ({
  handlers: [] as Handler[],
  invoke: vi.fn(),
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
const fetchMock = vi.fn();

beforeEach(() => {
  bus.handlers.length = 0;
  bus.invoke.mockReset().mockResolvedValue({ port: 51234, session: 9 });
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startGoogleOAuth", () => {
  it("usa a porta aleatória na redirect URI e troca o code recebido", async () => {
    bus.onOpen = () => emit({ session: 9, code: "g-code", error: null });
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "at", refresh_token: "rt", expires_in: 3599 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ email: "eu@gmail.com" }) });

    const tokens = await startGoogleOAuth(["scope-a"]);

    expect(tokens).toEqual({
      access_token: "at",
      refresh_token: "rt",
      expires_in: 3599,
      email: "eu@gmail.com",
    });
    expect(bus.invoke).toHaveBeenCalledWith("start_oauth_server", {});
    const body = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("code")).toBe("g-code");
    expect(body.get("redirect_uri")).toBe("http://localhost:51234/callback");
  });

  it("rejeita com o erro do Google sem chamar o endpoint de token", async () => {
    bus.onOpen = () => emit({ session: 9, code: null, error: "access_denied" });

    await expect(startGoogleOAuth(["scope-a"])).rejects.toThrow(
      "O Google recusou a autorização: access_denied"
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
