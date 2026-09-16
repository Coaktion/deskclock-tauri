import { invoke } from "@tauri-apps/api/core";
import { generateCodeChallenge, generateCodeVerifier } from "../google/pkce";
import { openOAuthCallback } from "../oauth/loopbackCallback";

// Porta fixa necessária porque o Zendesk exige match exato na redirect URI
const OAUTH_PORT = 27422;

export interface ZendeskTokens {
  access_token: string;
  refresh_token: string | null;
  expires_in: number | null;
  email: string;
}

interface RustHttpResponse {
  status: number;
  // `null` quando a resposta não é JSON (o Rust não falha nesse caso).
  body: Record<string, unknown> | null;
}

export async function startZendeskOAuth(
  subdomain: string,
  clientId: string,
  clientSecret: string
): Promise<ZendeskTokens> {
  const callback = await openOAuthCallback("Zendesk", OAUTH_PORT);
  const { redirectUri } = callback;

  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const authParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "read",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://${subdomain}.zendesk.com/oauth/authorizations/new?${authParams}`;

  const code = await callback.waitForCode(authUrl);

  const tokenParams: Record<string, string> = {
    client_id: clientId,
    redirect_uri: redirectUri,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    scope: "read",
  };
  if (clientSecret) tokenParams["client_secret"] = clientSecret;

  const tokenRes = await invoke<RustHttpResponse>("post_form_json", {
    url: `https://${subdomain}.zendesk.com/oauth/tokens`,
    params: tokenParams,
  });

  const tokenBody = tokenRes.body ?? {};
  if (tokenRes.status >= 400 || !tokenBody["access_token"]) {
    throw new Error(
      (tokenBody["error_description"] as string) ??
        (tokenBody["error"] as string) ??
        `Falha ao trocar o código de autorização (HTTP ${tokenRes.status}).`
    );
  }

  const userRes = await invoke<RustHttpResponse>("get_bearer_json", {
    url: `https://${subdomain}.zendesk.com/api/v2/users/me.json`,
    token: tokenBody["access_token"] as string,
  });
  const user = (userRes.body?.["user"] as Record<string, unknown>) ?? {};

  return {
    access_token: tokenBody["access_token"] as string,
    refresh_token: (tokenBody["refresh_token"] as string | undefined) ?? null,
    expires_in: (tokenBody["expires_in"] as number | undefined) ?? null,
    email: (user["email"] as string) ?? "",
  };
}
