import { invoke } from "@tauri-apps/api/core";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";

const BUFFER_MS = 5 * 60 * 1000;

interface RustHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export class ZendeskTokenManager {
  constructor(
    private config: ConfigContextValue,
    private subdomain: string
  ) {}

  isConnected(): boolean {
    return !!this.config.get("zendeskAccessToken");
  }

  getUserEmail(): string {
    return this.config.get("zendeskUserEmail");
  }

  async getValidAccessToken(): Promise<string> {
    const expiry = this.config.get("zendeskTokenExpiry");

    // expiry === 0 indica token sem prazo de expiração
    if (expiry > 0 && Date.now() >= expiry - BUFFER_MS) {
      await this.refresh();
    }

    return this.config.get("zendeskAccessToken");
  }

  async saveTokens(tokens: {
    access_token: string;
    refresh_token: string | null;
    expires_in: number | null;
    email: string;
  }): Promise<void> {
    await this.config.set("zendeskAccessToken", tokens.access_token);
    await this.config.set("zendeskRefreshToken", tokens.refresh_token ?? "");
    await this.config.set(
      "zendeskTokenExpiry",
      tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : 0
    );
    await this.config.set("zendeskUserEmail", tokens.email);
  }

  async clearTokens(): Promise<void> {
    await this.config.set("zendeskAccessToken", "");
    await this.config.set("zendeskRefreshToken", "");
    await this.config.set("zendeskTokenExpiry", 0);
    await this.config.set("zendeskUserEmail", "");
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.config.get("zendeskRefreshToken");
    if (!refreshToken) throw new Error("Sessão expirada. Reconecte o Zendesk.");

    const clientId = this.config.get("zendeskClientId");
    const clientSecret = this.config.get("zendeskClientSecret");

    const params: Record<string, string> = {
      client_id: clientId,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    };
    if (clientSecret) params["client_secret"] = clientSecret;

    const res = await invoke<RustHttpResponse>("post_form_json", {
      url: `https://${this.subdomain}.zendesk.com/oauth/tokens`,
      params,
    });

    if (res.status >= 400) {
      throw new Error((res.body["error_description"] as string) ?? "Falha ao renovar token");
    }

    await this.config.set("zendeskAccessToken", res.body["access_token"] as string);
    if (res.body["expires_in"]) {
      await this.config.set(
        "zendeskTokenExpiry",
        Date.now() + (res.body["expires_in"] as number) * 1000
      );
    }
    if (res.body["refresh_token"]) {
      await this.config.set("zendeskRefreshToken", res.body["refresh_token"] as string);
    }
  }
}
