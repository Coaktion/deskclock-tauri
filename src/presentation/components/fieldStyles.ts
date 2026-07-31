/**
 * Vocabulário visual dos campos de formulário em coluna — hoje o Lançamento
 * Manual e o Planejamento. Fica num módulo só porque são duas telas que
 * precisam parecer a mesma coisa: com as classes copiadas, um ajuste em uma
 * delas desalinha a outra em silêncio.
 *
 * Nada aqui é valor literal — só classes do Tailwind (§8.4 do CLAUDE.md).
 */

/** Campo comum: desenha a própria casca e ocupa a linha inteira. */
export const fieldClass =
  "w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500";

/**
 * Caixa que veste o visual de um input. Quando o campo divide a linha com um
 * botão ou com um texto auxiliar, é a caixa que desenha fundo, borda e raio — os
 * elementos internos ficam transparentes, e os dois passam a ler como um campo
 * só. `focus-within` reproduz no nível da caixa o realce que o input perdeu ao
 * abrir mão da própria borda.
 */
export const boxClass =
  "bg-gray-800 border border-gray-700 rounded-lg focus-within:border-blue-500 transition-colors";

/** Input sem casca: quem desenha é o `boxClass` em volta. */
export const bareInputClass =
  "w-full px-2.5 py-1.5 text-sm bg-transparent border-none text-gray-100 placeholder-gray-500 focus:outline-none";

/**
 * Rótulo encaixado na borda superior da caixa. O fundo do rótulo é o mesmo da
 * caixa, então ele apaga o trecho de borda que cobre. O `mt-1.5` compensa, no
 * fluxo, o tanto que o rótulo sobe.
 *
 * Cuidado ao usar sob um `space-y-*`: essa utilitária escreve `margin-top` no
 * próprio filho, então um `mt-1.5` no mesmo elemento **substitui** a margem do
 * space-y em vez de somar. Envolva a caixa num `<div>` quando ela for filha
 * direta de um container com `space-y-*`.
 */
export const notchedBoxClass = "relative mt-1.5";
export const notchedLabelClass =
  "absolute -top-2 left-1.5 px-1 bg-gray-800 text-xs text-gray-500 rounded-sm";

/** Coluna de formulário: largura fixa à esquerda, com a lista da tela ao lado. */
export const formColumnClass =
  "w-64 shrink-0 border-r border-gray-800 overflow-y-auto p-2 space-y-3";
