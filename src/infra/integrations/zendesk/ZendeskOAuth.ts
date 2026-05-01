import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openInBrowser } from "@shared/utils/shell";
import { generateCodeChallenge, generateCodeVerifier } from "../google/pkce";

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
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
  body: Record<string, unknown>;
}

export async function startZendeskOAuth(
  subdomain: string,
  clientId: string,
  clientSecret: string
): Promise<ZendeskTokens> {
  await invoke("start_oauth_server", { port: OAUTH_PORT });
  const redirectUri = `http://localhost:${OAUTH_PORT}/callback`;

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

  if (tokenRes.status >= 400) {
    throw new Error(
      (tokenRes.body["error_description"] as string) ??
        (tokenRes.body["error"] as string) ??
        "Falha ao trocar o código de autorização."
    );
  }

  const userRes = await invoke<RustHttpResponse>("get_bearer_json", {
    url: `https://${subdomain}.zendesk.com/api/v2/users/me.json`,
    token: tokenRes.body["access_token"] as string,
  });
  const user = (userRes.body["user"] as Record<string, unknown>) ?? {};

  return {
    access_token: tokenRes.body["access_token"] as string,
    refresh_token: (tokenRes.body["refresh_token"] as string | undefined) ?? null,
    expires_in: (tokenRes.body["expires_in"] as number | undefined) ?? null,
    email: (user["email"] as string) ?? "",
  };
}
