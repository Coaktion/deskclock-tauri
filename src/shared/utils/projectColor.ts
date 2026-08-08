/**
 * Devolve `var(--color-project-N)`, não um valor de cor: o retorno vai em
 * `style={{ backgroundColor }}`, onde a variável resolve como qualquer outra —
 * e é isso que faz a cor acompanhar o modo claro sem segunda tabela.
 */
const PROJECT_COLORS = [
  "var(--color-project-1)",
  "var(--color-project-2)",
  "var(--color-project-3)",
  "var(--color-project-4)",
  "var(--color-project-5)",
  "var(--color-project-6)",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function getProjectColor(projectId: string | null | undefined): string {
  if (!projectId) return "var(--color-project-none)";
  return PROJECT_COLORS[hashString(projectId) % PROJECT_COLORS.length];
}
