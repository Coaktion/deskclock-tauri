import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CLIENT_ID = import.meta.env.GCP_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.GCP_CLIENT_SECRET as string;

/**
 * Gerencia ciclo de vida dos tokens OAuth do Google:
 * leitura, persistência no Config e refresh automático.
 */
export class GoogleTokenManager {
  constructor(private config: ConfigContextValue) {}

  isConnected(): boolean {
    return !!this.config.get("googleRefreshToken");
  }

  getUserEmail(): string {
    return this.config.get("googleUserEmail");
  }

  async getValidAccessToken(): Promise<string> {
    const expiry = this.config.get("googleTokenExpiry");
    const BUFFER_MS = 5 * 60 * 1000; // 5 min de margem

    if (Date.now() >= expiry - BUFFER_MS) {
      await this.refresh();
    }

    return this.config.get("googleAccessToken");
  }

  async saveTokens(tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    email: string;
  }): Promise<void> {
    await this.config.set("googleAccessToken", tokens.access_token);
    await this.config.set("googleRefreshToken", tokens.refresh_token);
    await this.config.set("googleTokenExpiry", Date.now() + tokens.expires_in * 1000);
    await this.config.set("googleUserEmail", tokens.email);
  }

  async clearTokens(): Promise<void> {
    await this.config.set("googleAccessToken", "");
    await this.config.set("googleRefreshToken", "");
    await this.config.set("googleTokenExpiry", 0);
    await this.config.set("googleUserEmail", "");
  }

  private async refresh(): Promise<void> {
    const refreshToken = this.config.get("googleRefreshToken");
    if (!refreshToken) throw new Error("Não autenticado");

    const res = await fetch(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description ?? "Falha ao renovar token");

    // refresh_token pode não ser retornado no refresh — manter o existente
    await this.config.set("googleAccessToken", data.access_token);
    await this.config.set("googleTokenExpiry", Date.now() + data.expires_in * 1000);
  }
}
