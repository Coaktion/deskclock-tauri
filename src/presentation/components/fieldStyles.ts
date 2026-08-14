/**
 * Vocabulário visual dos campos de formulário — o Lançamento Manual, o
 * Planejamento e o modal de edição de tarefa. Fica num módulo só porque são
 * telas que precisam parecer a mesma coisa: com as classes copiadas, um ajuste
 * em uma delas desalinha as outras em silêncio.
 *
 * **Nem o campo nem o rótulo moram mais aqui.** `fieldClass` e `bareInputClass`
 * foram substituídos por `ui/controlStyles.ts`, que é o interior de `Input`,
 * `Select` e `Textarea`; e o rótulo — que era o entalhe na borda mais o rótulo
 * flutuante dos campos personalizados — virou o overline de `ui/Field.tsx`, com
 * as outras duas grafias que o app tinha. Classe solta não impede o próximo
 * campo de nascer à mão, e foi assim que quatro grafias conviveram.
 *
 * O que sobra é a caixa sem rótulo e a casca da coluna de formulário.
 *
 * Nada aqui é valor literal — só classes do Tailwind (§8.4 do CLAUDE.md).
 */

/**
 * Caixa que veste o visual de um input, **sem rótulo**. Quando o campo divide a
 * linha com um botão ou com um texto auxiliar, é a caixa que desenha fundo,
 * borda e raio — os elementos internos ficam transparentes, e os dois passam a
 * ler como um campo só. `focus-within` reproduz no nível da caixa o realce que o
 * input perdeu ao abrir mão da própria borda.
 *
 * **Com rótulo, o componente é o `ui/Field`** — ele desenha esta mesma caixa e o
 * overline acima dela. Aqui fica o caso em que a caixa é o campo inteiro, que é
 * o par categoria + billable dos modais de edição.
 */
export const boxClass =
  "bg-raised border border-border rounded-control focus-within:border-accent transition-colors";

/**
 * Rótulo de campo: o overline de 10px acima da caixa, na medida do spec (10/600,
 * `0.1em`, `fg-muted`). **Quem o escreve é o `ui/Field`** — ele está exportado
 * aqui por um call site só, o "Período" da exportação, cujo rótulo veste um par
 * de botões seguido de duas datas, e não um controle que caiba numa caixa.
 *
 * O `uppercase` fica na classe porque é transformação, não tamanho: o token
 * `text-overline` carrega peso e tracking, e só eles (§8.4).
 */
export const fieldLabelClass = "text-overline uppercase text-fg-muted";

/**
 * Casca da coluna de formulário: fica à esquerda, com a lista da tela ao lado.
 * Quem a desenha é o `CollapsibleFormColumn` — a casca é o que permanece quando
 * o formulário é recolhido, e por isso ela não rola nem espaça nada.
 *
 * **Sem largura e sem borda à direita, de propósito.** A largura é arrastável e
 * vem do `useResizablePanel` como estilo em linha (classe do Tailwind é estática
 * e não expressa um valor que o usuário escolhe); a borda é o próprio
 * `ResizeHandle`, ou haveria linha dupla entre a coluna e a lista.
 */
export const formColumnShellClass = "shrink-0 min-w-0 flex flex-col";

/**
 * Limites do arraste das colunas de formulário. O padrão são os **280px do
 * spec** (telas 3e e 3f), e não os 256 com que a coluna nasceu — o `w-64` que
 * ela tinha fixa antes de virar arrastável.
 *
 * **Este é o único lugar que declara o padrão.** Ele estava escrito também em
 * `ConfigContext`, e era de lá que o número saía de verdade: `useResizablePanel`
 * só cai no `defaultSize` quando o valor gravado é 0, e a config nunca devolve 0
 * — devolve o `DEFAULTS` dela. Enquanto os dois discordassem, a trava podia
 * afirmar um número que a tela não usava.
 */
export const FORM_COLUMN_WIDTH = { min: 224, max: 560, default: 280 } as const;

/**
 * Corpo do formulário dentro da casca: é ele que rola e que espaça os campos.
 * Separado da casca porque o cabeçalho com o botão de recolher precisa ficar
 * parado enquanto os campos rolam por baixo.
 *
 * `p-3` e `space-y-3` são os **12/12 do spec** — o padding acompanha o gap, que
 * já era 12. Em `p-2` a coluna apertava os campos contra a borda e contra o
 * cabeçalho, que espaça por fora deles.
 */
export const formColumnClass = "flex-1 min-h-0 overflow-y-auto p-3 space-y-3";
