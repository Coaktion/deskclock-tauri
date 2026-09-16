import { openOAuthCallback } from "../oauth/loopbackCallback";
import { generateCodeChallenge, generateCodeVerifier } from "./pkce";

const CLIENT_ID = import.meta.env.GCP_CLIENT_ID as string;
const CLIENT_SECRET = import.meta.env.GCP_CLIENT_SECRET as string;
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v2/userinfo";

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
 * 3. Aguarda o code (ou o erro) que o servidor Rust recebe no redirect
 * 4. Troca o authorization code pelos tokens via fetch
 * 5. Busca o e-mail do usuário e retorna tudo
 */
export async function startGoogleOAuth(scopes: string[]): Promise<GoogleTokens> {
  const callback = await openOAuthCallback("Google");
  const { redirectUri } = callback;

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

  const code = await callback.waitForCode(authUrl);

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
