/**
 * Vocabulário visual dos campos de formulário — o Lançamento Manual, o
 * Planejamento e o modal de edição de tarefa. Fica num módulo só porque são
 * telas que precisam parecer a mesma coisa: com as classes copiadas, um ajuste
 * em uma delas desalinha as outras em silêncio.
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

/**
 * Rótulo que começa **dentro** do campo, como placeholder, e sobe para a borda
 * ao focar ou quando há valor — chegando exatamente na posição do
 * `notchedLabelClass`, para não existirem dois desenhos de rótulo na mesma tela.
 *
 * Só os campos personalizados usam isto, e por um motivo específico: eles são
 * dinâmicos. "Project Stage" e "Nº do chamado" não se explicam pela posição no
 * formulário como Nome, Projeto e Categoria se explicam, então o rótulo precisa
 * continuar visível **depois** de preenchido — o que um placeholder puro não faz.
 *
 * Implementação sem JavaScript: o estado vem do próprio input via `:focus` e
 * `:placeholder-shown`, lidos do wrapper com `group-*`. Por isso o controle
 * precisa de `placeholder=" "` — sem placeholder, `:placeholder-shown` nunca
 * casa e o rótulo fica preso no alto.
 *
 * As variantes estão escritas por extenso de propósito: classe montada em
 * runtime não é vista pelo scanner do Tailwind e não geraria CSS nenhum.
 *
 * O grupo é **nomeado** (`/cf`) porque `group-*` casa com qualquer ancestral que
 * tenha `.group`: um card acima que use `group` para hover faria todos os
 * rótulos flutuarem ao focar qualquer campo, sem erro nenhum para avisar.
 */
export const floatingFieldClass = "group/cf relative mt-1.5";
export const floatingLabelClass = [
  "pointer-events-none absolute left-2.5 top-1.5 text-sm text-gray-500 transition-all duration-150",
  "group-focus-within/cf:-top-2 group-focus-within/cf:left-1.5 group-focus-within/cf:px-1",
  "group-focus-within/cf:text-xs group-focus-within/cf:bg-gray-800 group-focus-within/cf:rounded-sm",
  "group-has-[input:not(:placeholder-shown)]/cf:-top-2 group-has-[input:not(:placeholder-shown)]/cf:left-1.5",
  "group-has-[input:not(:placeholder-shown)]/cf:px-1 group-has-[input:not(:placeholder-shown)]/cf:text-xs",
  "group-has-[input:not(:placeholder-shown)]/cf:bg-gray-800 group-has-[input:not(:placeholder-shown)]/cf:rounded-sm",
  "group-has-[textarea:not(:placeholder-shown)]/cf:-top-2 group-has-[textarea:not(:placeholder-shown)]/cf:left-1.5",
  "group-has-[textarea:not(:placeholder-shown)]/cf:px-1 group-has-[textarea:not(:placeholder-shown)]/cf:text-xs",
  "group-has-[textarea:not(:placeholder-shown)]/cf:bg-gray-800 group-has-[textarea:not(:placeholder-shown)]/cf:rounded-sm",
].join(" ");

/** Coluna de formulário: largura fixa à esquerda, com a lista da tela ao lado. */
export const formColumnClass =
  "w-64 shrink-0 border-r border-gray-800 overflow-y-auto p-2 space-y-3";
