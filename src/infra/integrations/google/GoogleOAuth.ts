import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openInBrowser } from "@shared/utils/shell";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce";

const CLIENT_ID = import.meta.env.GCP_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.GCP_CLIENT_SECRET as string;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";
const AUTH_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutos

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  email: string;
}

/**
 * Executa o fluxo OAuth Authorization Code com o Google.
 *
 * 1. Abre um servidor HTTP temporário no Rust (porta aleatória)
 * 2. Abre o browser com a URL de autorização do Google
 * 3. Aguarda o evento "oauth_callback_received" emitido pelo servidor Rust
 * 4. Troca o authorization code pelos tokens via fetch
 * 5. Busca o e-mail do usuário e retorna tudo
 */
export async function startGoogleOAuth(scopes: string[]): Promise<GoogleTokens> {
  const port: number = await invoke("start_oauth_server");
  const redirectUri = `http://localhost:${port}/callback`;

  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const authParams = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${authParams}`;

  // Aguarda o code vindo do servidor Rust
  const code = await new Promise<string>((resolve, reject) => {
    let unlisten: (() => void) | undefined;

    const timer = setTimeout(() => {
      unlisten?.();
      reject(new Error("Timeout: autorização não concluída em 5 minutos."));
    }, AUTH_TIMEOUT_MS);

    listen<string>("oauth_callback_received", (event) => {
      clearTimeout(timer);
      unlisten?.();
      resolve(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    openInBrowser(authUrl).catch((err) => {
      clearTimeout(timer);
      unlisten?.();
      reject(new Error(`Não foi possível abrir o browser: ${err}`));
    });
  });

  // Troca o code por tokens
  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokens.error_description ?? "Falha ao trocar o código de autorização.");
  }

  // Busca o e-mail do usuário autenticado
  const userRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userRes.json().catch(() => ({}));

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    email: userInfo.email ?? "",
  };
}
