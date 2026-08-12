/**
 * A caixa de seleção múltipla das listas de tarefa — a da linha (`TaskRow.leading`)
 * e a do cartão do dia (`SectionCard.leading`), que a comanda.
 *
 * Ela mora aqui, e não no call site, porque **é o alinhamento entre as duas que
 * diz que uma comanda as outras**: a faixa do cabeçalho e a linha compartilham o
 * `px-3`, e caixas de tamanhos diferentes desfariam a coluna em silêncio. Eram
 * quatro grafias da mesma peça — as mesmas classes em quatro ordens, duas delas
 * sem o `shrink-0` que a coluna de largura fixa do `TaskRow` pede.
 *
 * **Não é um `Checkbox` canônico.** É vocabulário de classe, como
 * `chipStyles.ts` e `fieldStyles.ts`: caixa, rádio e faixa não têm casca, fundo
 * nem raio, e por isso a assinatura do `Input` os recusa. O primitivo, se valer,
 * é trabalho próprio.
 */
export const selectionBoxClass = "shrink-0 w-3.5 h-3.5 accent-accent cursor-pointer";
