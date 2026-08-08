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
  "w-full px-2.5 py-1.5 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent";

/**
 * Caixa que veste o visual de um input. Quando o campo divide a linha com um
 * botão ou com um texto auxiliar, é a caixa que desenha fundo, borda e raio — os
 * elementos internos ficam transparentes, e os dois passam a ler como um campo
 * só. `focus-within` reproduz no nível da caixa o realce que o input perdeu ao
 * abrir mão da própria borda.
 */
export const boxClass =
  "bg-raised border border-border rounded-control focus-within:border-accent transition-colors";

/** Input sem casca: quem desenha é o `boxClass` em volta. */
export const bareInputClass =
  "w-full px-2.5 py-1.5 text-sm bg-transparent border-none text-fg placeholder-fg-muted focus:outline-none";

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
  "absolute -top-2 left-1.5 px-1 bg-raised text-xs text-fg-muted rounded-sm";

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
  "pointer-events-none absolute left-2.5 top-1.5 text-sm text-fg-muted transition-all duration-150",
  "group-focus-within/cf:-top-2 group-focus-within/cf:left-1.5 group-focus-within/cf:px-1",
  "group-focus-within/cf:text-xs group-focus-within/cf:bg-raised group-focus-within/cf:rounded-sm",
  "group-has-[input:not(:placeholder-shown)]/cf:-top-2 group-has-[input:not(:placeholder-shown)]/cf:left-1.5",
  "group-has-[input:not(:placeholder-shown)]/cf:px-1 group-has-[input:not(:placeholder-shown)]/cf:text-xs",
  "group-has-[input:not(:placeholder-shown)]/cf:bg-raised group-has-[input:not(:placeholder-shown)]/cf:rounded-sm",
  "group-has-[textarea:not(:placeholder-shown)]/cf:-top-2 group-has-[textarea:not(:placeholder-shown)]/cf:left-1.5",
  "group-has-[textarea:not(:placeholder-shown)]/cf:px-1 group-has-[textarea:not(:placeholder-shown)]/cf:text-xs",
  "group-has-[textarea:not(:placeholder-shown)]/cf:bg-raised group-has-[textarea:not(:placeholder-shown)]/cf:rounded-sm",
].join(" ");

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

/** Limites do arraste das colunas de formulário. O padrão é a largura que elas
 *  tinham fixa (`w-64`), então quem nunca arrastar não vê diferença. */
export const FORM_COLUMN_WIDTH = { min: 224, max: 560, default: 256 } as const;

/**
 * Corpo do formulário dentro da casca: é ele que rola e que espaça os campos.
 * Separado da casca porque o cabeçalho com o botão de recolher precisa ficar
 * parado enquanto os campos rolam por baixo.
 */
export const formColumnClass = "flex-1 min-h-0 overflow-y-auto p-2 space-y-3";
