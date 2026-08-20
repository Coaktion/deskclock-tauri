/**
 * `Promise.all` com teto de tarefas em voo, preservando a ordem do resultado.
 *
 * Existe porque o meio-termo entre "uma de cada vez" e "todas de uma vez" não
 * tem forma pronta em JS. O sequencial paga a latência de cada ida somada; o
 * `Promise.all` cru dispara tudo, e contra uma API com limite de requisições
 * isso troca lentidão por 429 intermitente — que é pior, porque é aleatório.
 *
 * **A ordem do retorno é a da entrada**, não a de chegada: quem chama concatena
 * lotes de páginas e de boards, e uma ordem que muda a cada execução faria a
 * mesma busca devolver a lista embaralhada de um jeito diferente por vez.
 *
 * O primeiro erro rejeita, como no `Promise.all` — os trabalhadores restantes
 * terminam o que já começaram, mas nada novo é iniciado.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}
