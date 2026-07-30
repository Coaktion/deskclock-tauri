/**
 * Cor de workspace derivada do nome.
 *
 * O valor guardado no banco e devolvido daqui é sempre o **nome de um slot da
 * paleta** — nunca um valor de cor. A tradução para CSS acontece na camada de
 * apresentação, via `var(--color-<slot>-<peso>)`, tokens que o Tailwind v4 já
 * expõe. Nenhum token novo é criado (regra "zero hardcode visual").
 *
 * A curadoria evita:
 *   - `blue` e `green`, que são os accents de tema (o tema Verde remapeia um no
 *     outro, então as duas famílias estão reservadas);
 *   - `gray`, `zinc`, `slate`, `neutral` e `stone`, usados como superfícies e
 *     também remapeados pelos temas Escuro e Claro.
 */
export const WORKSPACE_COLORS = [
  "rose",
  "orange",
  "amber",
  "lime",
  "teal",
  "cyan",
  "violet",
  "fuchsia",
] as const;

export type WorkspaceColor = (typeof WORKSPACE_COLORS)[number];

/**
 * Hash determinístico (djb2 truncado em 32 bits) — a mesma entrada devolve
 * sempre o mesmo slot, em qualquer plataforma, sem depender de `Math.random`
 * nem da ordem de criação dos workspaces.
 */
function hashName(name: string): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Slot da paleta para um nome de workspace. Nome vazio cai no primeiro slot. */
export function workspaceColorFor(name: string): WorkspaceColor {
  return WORKSPACE_COLORS[hashName(name.trim()) % WORKSPACE_COLORS.length];
}

/** `true` se o valor persistido ainda corresponde a um slot conhecido. */
export function isWorkspaceColor(value: string): value is WorkspaceColor {
  return (WORKSPACE_COLORS as readonly string[]).includes(value);
}
