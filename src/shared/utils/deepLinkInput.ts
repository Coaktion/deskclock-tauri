/**
 * Leitura do deeplink que a pessoa cola à mão.
 *
 * O campo aceita **qualquer** deeplink do app (`navigate`, `task/start`,
 * `retroactive`, `task/share`) e quem decide o destino é o Rust — reimplementar
 * o roteamento aqui criaria uma segunda tabela de rotas para manter em
 * sincronia. O que esta função faz é só o que dá para responder sem o Rust:
 * dizer se o texto **tem forma** de link do DeskClock, para a ação primária não
 * ficar clicável sobre um texto que já se sabe que vai voltar com erro.
 *
 * O prefixo é comparado em caixa exata porque é assim que o `handle_deep_link`
 * o compara (`strip_prefix`): fosse tolerante aqui, `DeskClock://` passaria pela
 * validação local e voltaria reprovado do outro lado.
 */
import { parseShareLink, SHARE_LINK_PATH, SHARE_LINK_SCHEME } from "./shareLink";

export const DEEP_LINK_PREFIX = `${SHARE_LINK_SCHEME}://`;

const SHARE_PREFIX = `${DEEP_LINK_PREFIX}${SHARE_LINK_PATH}`;

/** `task/share` precisa terminar ali: `task/sharefoo` é outra rota, do Rust. */
function isShareLink(url: string): boolean {
  if (!url.startsWith(SHARE_PREFIX)) return false;
  const rest = url.slice(SHARE_PREFIX.length);
  return rest === "" || rest.startsWith("?") || rest.startsWith("/");
}

export interface DeepLinkInput {
  /** O texto sem os espaços das pontas — é o que vai para o Rust. */
  url: string;
  /** Se a ação primária pode ser acionada. */
  ready: boolean;
  /** Mensagem sob o campo. `null` também enquanto o campo está vazio: campo
   *  intocado não é campo errado. */
  error: string | null;
  /** Nome da tarefa, quando o link é de `task/share` e já dá para lê-lo. */
  sharedName: string | null;
}

export function readDeepLinkInput(raw: string): DeepLinkInput {
  const url = raw.trim();

  if (!url) return { url, ready: false, error: null, sharedName: null };

  if (!url.startsWith(DEEP_LINK_PREFIX)) {
    return {
      url,
      ready: false,
      error: `O link precisa começar com ${DEEP_LINK_PREFIX}`,
      sharedName: null,
    };
  }

  if (url.length === DEEP_LINK_PREFIX.length) {
    return {
      url,
      ready: false,
      error: "Falta o destino depois do prefixo.",
      sharedName: null,
    };
  }

  // Validação otimista, e só para o link de tarefa compartilhada: é o único
  // formato que o TS sabe ler inteiro (`shareLink.ts`), e sem nome ele abriria
  // um modal vazio do outro lado.
  if (isShareLink(url)) {
    const payload = parseShareLink(url);
    if (!payload) {
      return {
        url,
        ready: false,
        error: "Este link de tarefa não traz o nome da tarefa.",
        sharedName: null,
      };
    }
    return { url, ready: true, error: null, sharedName: payload.name };
  }

  return { url, ready: true, error: null, sharedName: null };
}
