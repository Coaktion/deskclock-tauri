import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig, ConfigContextValue } from "@presentation/contexts/ConfigContext";

// Stub de env antes do import do módulo (constantes capturadas no load-time)
vi.stubEnv("GCP_CLIENT_ID", "test-client-id");
vi.stubEnv("GCP_CLIENT_SECRET", "test-client-secret");

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { GoogleTokenManager } = await import(
  "@infra/integrations/google/GoogleTokenManager"
);

function makeConfig(overrides: Partial<AppConfig> = {}): ConfigContextValue {
  const store: Partial<AppConfig> = {
    googleRefreshToken: "refresh-token",
    googleAccessToken: "access-token",
    googleTokenExpiry: Date.now() + 3_600_000,
    googleUserEmail: "user@example.com",
    ...overrides,
  };
  return {
    isLoaded: true,
    get: vi.fn(<K extends keyof AppConfig>(key: K) => store[key] as AppConfig[K]),
    set: vi.fn(async <K extends keyof AppConfig>(key: K, value: AppConfig[K]) => {
      (store as Record<string, unknown>)[key as string] = value;
    }),
  };
}

describe("GoogleTokenManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isConnected", () => {
    it("retorna true quando googleRefreshToken está preenchido", () => {
      const mgr = new GoogleTokenManager(makeConfig({ googleRefreshToken: "token" }));
      expect(mgr.isConnected()).toBe(true);
    });

    it("retorna false quando googleRefreshToken está vazio", () => {
      const mgr = new GoogleTokenManager(makeConfig({ googleRefreshToken: "" }));
      expect(mgr.isConnected()).toBe(false);
    });
  });

  describe("getUserEmail", () => {
    it("retorna o email salvo no config", () => {
      const mgr = new GoogleTokenManager(makeConfig({ googleUserEmail: "test@example.com" }));
      expect(mgr.getUserEmail()).toBe("test@example.com");
    });
  });

  describe("getValidAccessToken", () => {
    it("retorna o token salvo quando não está expirado", async () => {
      const config = makeConfig({
        googleAccessToken: "valid-token",
        googleTokenExpiry: Date.now() + 3_600_000,
      });
      const mgr = new GoogleTokenManager(config);
      const token = await mgr.getValidAccessToken();
      expect(token).toBe("valid-token");
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("faz refresh quando o token está expirado", async () => {
      const config = makeConfig({
        googleRefreshToken: "my-refresh",
        googleTokenExpiry: Date.now() - 1_000,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "refreshed", expires_in: 3600 }),
      });
      const mgr = new GoogleTokenManager(config);
      await mgr.getValidAccessToken();
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("faz refresh quando o token expira dentro do buffer de 5 minutos", async () => {
      const config = makeConfig({
        googleRefreshToken: "my-refresh",
        googleTokenExpiry: Date.now() + 4 * 60 * 1_000, // 4 min < buffer de 5 min
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "refreshed", expires_in: 3600 }),
      });
      const mgr = new GoogleTokenManager(config);
      await mgr.getValidAccessToken();
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("lança erro quando não há refresh token", async () => {
      const config = makeConfig({ googleRefreshToken: "", googleTokenExpiry: 0 });
      const mgr = new GoogleTokenManager(config);
      await expect(mgr.getValidAccessToken()).rejects.toThrow("Não autenticado");
    });
  });

  describe("saveTokens", () => {
    it("salva os quatro valores no config", async () => {
      const config = makeConfig();
      const mgr = new GoogleTokenManager(config);
      const before = Date.now();
      await mgr.saveTokens({
        access_token: "new-access",
        refresh_token: "new-refresh",
        expires_in: 3600,
        email: "new@example.com",
      });
      expect(config.set).toHaveBeenCalledWith("googleAccessToken", "new-access");
      expect(config.set).toHaveBeenCalledWith("googleRefreshToken", "new-refresh");
      expect(config.set).toHaveBeenCalledWith("googleUserEmail", "new@example.com");
      const expiryCall = (config.set as ReturnType<typeof vi.fn>).mock.calls.find(
        (call: unknown[]) => call[0] === "googleTokenExpiry"
      );
      const expiry = expiryCall?.[1] as number;
      expect(expiry).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(expiry).toBeLessThanOrEqual(Date.now() + 3_600_000);
    });
  });

  describe("clearTokens", () => {
    it("zera todos os tokens no config", async () => {
      const config = makeConfig();
      const mgr = new GoogleTokenManager(config);
      await mgr.clearTokens();
      expect(config.set).toHaveBeenCalledWith("googleAccessToken", "");
      expect(config.set).toHaveBeenCalledWith("googleRefreshToken", "");
      expect(config.set).toHaveBeenCalledWith("googleTokenExpiry", 0);
      expect(config.set).toHaveBeenCalledWith("googleUserEmail", "");
    });
  });

  describe("refresh (via getValidAccessToken com token expirado)", () => {
    it("envia refresh_token e grant_type corretos no body", async () => {
      const config = makeConfig({
        googleRefreshToken: "my-refresh-token",
        googleTokenExpiry: 0,
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "new-token", expires_in: 3600 }),
      });
      const mgr = new GoogleTokenManager(config);
      await mgr.getValidAccessToken();
      const [, init] = mockFetch.mock.calls[0];
      const body = new URLSearchParams(init.body as string);
      expect(body.get("refresh_token")).toBe("my-refresh-token");
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("client_id")).toBe("test-client-id");
      expect(body.get("client_secret")).toBe("test-client-secret");
    });

    it("atualiza o access_token após refresh bem-sucedido", async () => {
      const config = makeConfig({ googleTokenExpiry: 0 });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: "fresh-token", expires_in: 3600 }),
      });
      const mgr = new GoogleTokenManager(config);
      await mgr.getValidAccessToken();
      expect(config.set).toHaveBeenCalledWith("googleAccessToken", "fresh-token");
    });

    it("lança erro com error_description quando a resposta não é ok", async () => {
      const config = makeConfig({ googleTokenExpiry: 0 });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error_description: "Token revogado" }),
      });
      const mgr = new GoogleTokenManager(config);
      await expect(mgr.getValidAccessToken()).rejects.toThrow("Token revogado");
    });

    it("lança erro genérico quando error_description está ausente", async () => {
      const config = makeConfig({ googleTokenExpiry: 0 });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });
      const mgr = new GoogleTokenManager(config);
      await expect(mgr.getValidAccessToken()).rejects.toThrow("Falha ao renovar token");
    });
  });
});
