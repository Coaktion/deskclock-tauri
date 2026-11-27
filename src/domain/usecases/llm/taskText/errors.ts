/**
 * O provedor respondeu, mas o texto não traz o JSON pedido.
 *
 * Mora em `domain/` e não reaproveita o `LlmEmptyResponseError` porque aquele
 * é de `infra/`, que `domain/` não pode importar. Para quem lê a tela os dois
 * pedem a mesma coisa — tentar de novo —, e a apresentação os distingue por
 * `instanceof` como já faz com os erros do adapter.
 */
export class TaskTextResponseError extends Error {
  constructor(message = "O provedor devolveu uma resposta que não deu para ler. Tente novamente.") {
    super(message);
    this.name = "TaskTextResponseError";
  }
}
