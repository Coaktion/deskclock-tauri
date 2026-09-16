import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openInBrowser } from "@shared/utils/shell";

export const AUTH_TIMEOUT_MS = 5 * 60 * 1000;
const CALLBACK_EVENT = "oauth_callback_received";
// Prefixo com que o `start_oauth_server` (Rust) sinaliza porta ocupada.
const PORT_IN_USE_PREFIX = "port_in_use";

interface ServerHandle {
  port: number;
  session: number;
}

interface CallbackPayload {
  session: number;
  code: string | null;
  error: string | null;
}

export interface OAuthCallback {
  redirectUri: string;
  /** Abre o browser em `authUrl` e resolve com o authorization code. */
  waitForCode(authUrl: string): Promise<string>;
}

/**
 * Sobe o servidor de retorno no Rust (porta fixa, ou aleatória sem `port`).
 * `provider` só nomeia o serviço nas mensagens de erro.
 */
export async function openOAuthCallback(provider: string, port?: number): Promise<OAuthCallback> {
  let handle: ServerHandle;
  try {
    handle = await invoke<ServerHandle>("start_oauth_server", port ? { port } : {});
  } catch (err) {
    // O invoke do Tauri rejeita com string, não com Error.
    const detail = String(err);
    if (port && detail.startsWith(PORT_IN_USE_PREFIX)) {
      throw new Error(
        `A porta ${port}, usada no retorno do ${provider}, está ocupada por outro programa.`
      );
    }
    throw new Error(`Não foi possível iniciar o retorno da autorização do ${provider}: ${detail}`);
  }

  return {
    redirectUri: `http://localhost:${handle.port}/callback`,
    waitForCode: (authUrl) => waitForCode(handle.session, provider, authUrl),
  };
}

async function waitForCode(session: number, provider: string, authUrl: string): Promise<string> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (err: Error) => void;
  const result = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  // O ouvinte é registrado antes de abrir o browser, senão um retorno rápido se perde.
  // A sessão filtra o retorno de uma tentativa anterior que ainda esteja esperando.
  const unlisten = await listen<CallbackPayload>(CALLBACK_EVENT, ({ payload }) => {
    if (payload.session !== session) return;
    if (payload.error) {
      rejectCode(new Error(`O ${provider} recusou a autorização: ${payload.error}`));
    } else if (payload.code) {
      resolveCode(payload.code);
    }
  });

  const timer = setTimeout(
    () =>
      rejectCode(
        new Error(`Timeout: autorização não concluída em ${AUTH_TIMEOUT_MS / 60_000} minutos.`)
      ),
    AUTH_TIMEOUT_MS
  );

  openInBrowser(authUrl).catch((err) =>
    rejectCode(new Error(`Não foi possível abrir o browser: ${err}`))
  );

  try {
    return await result;
  } finally {
    clearTimeout(timer);
    unlisten();
  }
}
