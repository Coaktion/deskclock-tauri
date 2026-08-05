/**
 * Teto da mensagem de erro de ciclo persistida. Ela vem de terceiro (Google,
 * Monday) e vai para o banco e para a tela: convém um limite, e nunca o objeto
 * de erro inteiro.
 */
const MAX_ERROR_CHARS = 300;

export function truncateError(message: string): string {
  if (message.length <= MAX_ERROR_CHARS) return message;
  return `${message.slice(0, MAX_ERROR_CHARS)}…`;
}
