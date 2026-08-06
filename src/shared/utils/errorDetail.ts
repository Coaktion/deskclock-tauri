/** Teto do detalhe técnico. Vem de terceiro e vai para um tooltip, não para um parágrafo. */
const MAX_DETAIL_CHARS = 200;

/**
 * Os dois nomes sob os quais um erro pode carregar a sua causa.
 *
 * `cause` é o padrão da linguagem (ES2022) e **não** está nos tipos deste
 * projeto, que compila para ES2021 — daí o acesso estrutural em vez do campo.
 * `originalCause` é a convenção que as classes de erro das integrações já usavam
 * antes disso. Ler os dois evita tanto uma migração de `lib` fora do escopo
 * quanto uma renomeação em cascata.
 */
interface WithCause {
  cause?: unknown;
  originalCause?: unknown;
}

function describe(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.name && cause.name !== "Error" ? `${cause.name}: ${cause.message}` : cause.message;
  }
  if (typeof cause === "string") return cause;
  return String(cause);
}

/**
 * A causa técnica por trás de um erro, para exibição discreta — o texto do
 * tooltip do ícone de erro, nunca a mensagem principal.
 *
 * O caso que motivou isto é o `MondayNetworkError`, que guardava a causa e nunca
 * a mostrava: "verifique sua internet" é o mesmo texto para DNS, proxy
 * corporativo e certificado recusado, e a única pista de qual dos três era
 * morria no ponto de origem.
 *
 * Devolve `undefined` quando não há o que acrescentar — inclusive quando a causa
 * só repete a mensagem que o usuário já está lendo, que é ruído com cara de
 * informação.
 */
export function errorDetail(err: unknown): string | undefined {
  if (!(err instanceof Error)) return undefined;

  const { cause, originalCause } = err as Error & WithCause;
  const raw = cause ?? originalCause;
  if (raw === undefined || raw === null) return undefined;

  const detail = describe(raw).trim();
  if (!detail || detail === err.message) return undefined;
  return detail.length > MAX_DETAIL_CHARS ? `${detail.slice(0, MAX_DETAIL_CHARS)}…` : detail;
}
