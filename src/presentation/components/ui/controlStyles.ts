/**
 * Vocabulário compartilhado por `Input`, `Select` e `Textarea`. Fica num módulo
 * próprio porque os três desenham exatamente a mesma casca: escrito dentro de
 * cada um, o dia em que a borda de foco mudar ela mudaria em dois dos três.
 *
 * Isto substitui `fieldClass` e `bareInputClass` de `components/fieldStyles.ts`
 * — os valores são os mesmos, mas ali eram classe solta e aqui são o interior
 * de um componente, que é o que impede o próximo campo de nascer à mão.
 */

/**
 * `boxed` desenha a própria casca; `bare` abre mão dela para o `Field` (ou o
 * `boxClass`) em volta desenhar fundo, borda e raio — é o que faz o campo e o
 * botão ao lado lerem como uma coisa só.
 *
 * **`plain` não desenha casca nem padding**, e a distinção com o `bare` é real:
 * o `bare` mora numa caixa que traça a borda e não espaça nada, então é ele
 * quem espaça; o `plain` mora numa **linha** que já espaça (a busca do acesso
 * rápido, a linha "adicionar" das listas, o editor de renomear), e ali qualquer
 * padding próprio desalinha o campo dos irmãos. É também o escape para o
 * controle cuja casca não é a do formulário — a borda em acento do editor
 * inline —, e por isso é o único que espera classes de cor vindas de fora.
 */
export type ControlVariant = "boxed" | "bare" | "plain";

/**
 * `sm` é o controle dos formulários densos (a coluna do Planejamento, o popup
 * de 264 px, os editores por linha dos modais de lista). Existe para o tamanho
 * morar **num** lugar: hoje ele é `text-xs` escrito em dezenas de call sites, e
 * a fase B da rodada de fidelidade o promove trocando esta linha.
 */
export type ControlSize = "sm" | "md";

const SHELL: Record<ControlVariant, string> = {
  boxed: "bg-raised border border-border rounded-control focus:border-accent",
  bare: "bg-transparent border-none",
  plain: "bg-transparent border-none",
};

/** Por extenso, nunca montado em runtime: o scanner do Tailwind não vê classe
 *  interpolada e não geraria CSS nenhum para ela (§8.4). */
const TEXT: Record<ControlSize, string> = {
  sm: "text-xs",
  md: "text-sm",
};

const PADDING: Record<ControlSize, string> = {
  sm: "px-2 py-1",
  md: "px-2.5 py-1.5",
};

/**
 * A largura é sempre `w-full` — quem governa a medida é o container, e é assim
 * que os call sites já se comportavam. Para um campo estreito, dê a largura ao
 * elemento em volta.
 */
export function controlClass(
  variant: ControlVariant,
  size: ControlSize,
  invalid: boolean,
  className: string
): string {
  // `invalid` só existe na casca própria: no `bare` quem desenha a borda é o
  // `Field`, e é lá que a marca de erro precisa entrar (o `DatePickerInput` já
  // faz assim). Escrita aqui, ela não pintaria nada e pareceria um bug do campo.
  const border = invalid && variant === "boxed" ? "border-danger!" : "";

  return [
    "w-full text-fg placeholder-fg-muted focus:outline-none transition-colors",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    SHELL[variant],
    TEXT[size],
    // O `plain` não espaça: a linha em volta já espaçou, e um padding aqui o
    // desalinharia dos irmãos dela. É a única diferença entre ele e o `bare`.
    variant === "plain" ? "" : PADDING[size],
    border,
    className,
  ]
    .filter(Boolean)
    .join(" ");
}
