/**
 * Chips de atributo do omnibox — projeto, categoria, billable, campos. O
 * tracejado é o que diz "ainda vazio"; preenchido, o chip ganha fundo.
 */
const box = "px-2 py-0.75 rounded-chip text-sm border";
const base = `${box} transition-colors cursor-pointer whitespace-nowrap`;

export const chipFilledClass = `${base} bg-raised border-border text-fg-secondary hover:text-fg`;

export const chipEmptyClass = `${base} border-dashed border-border text-fg-muted hover:border-fg-muted hover:text-fg-secondary`;

export const chipBillableClass = `${base} bg-billable/10 border-billable/30 text-billable hover:bg-billable/20`;

export const chipNonBillableClass = `${base} bg-raised border-border text-fg-muted hover:text-fg-secondary`;

/**
 * Os chips da prévia do texto da tarefa que só mostram — sem hover nem cursor,
 * porque clicar neles não faz nada. Mesma caixa, para a faixa não pular de
 * altura entre o rascunho e a prévia.
 */
const staticBase = `${box} whitespace-nowrap truncate max-w-full`;

export const chipStaticFilledClass = `${staticBase} bg-raised border-border text-fg-secondary`;

export const chipStaticEmptyClass = `${staticBase} border-dashed border-border text-fg-muted`;

/** O campo que o texto deixou ambíguo: o único chip da prévia que pede uma escolha. */
export const chipAttentionClass = `${base} inline-flex items-center gap-1 bg-accent/10 border-accent/40 text-accent-text hover:bg-accent/20`;
