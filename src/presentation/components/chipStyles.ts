/**
 * Chips de atributo do omnibox — projeto, categoria, billable, campos. O
 * tracejado é o que diz "ainda vazio"; preenchido, o chip ganha fundo.
 */
const base =
  "px-2 py-0.5 rounded-chip text-xs border transition-colors cursor-pointer whitespace-nowrap";

export const chipFilledClass = `${base} bg-raised border-border text-fg-secondary hover:text-fg`;

export const chipEmptyClass = `${base} border-dashed border-border text-fg-muted hover:border-fg-muted hover:text-fg-secondary`;

export const chipBillableClass = `${base} bg-billable/10 border-billable/30 text-billable hover:bg-billable/20`;

export const chipNonBillableClass = `${base} bg-raised border-border text-fg-muted hover:text-fg-secondary`;
