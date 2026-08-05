/**
 * Extrai metadados de Projeto, Categoria e Faturável da descrição de um evento do Google Agenda.
 *
 * Formato suportado (qualquer caixa, ex: "projeto:", "PROJETO:", "Projeto:"):
 *   Projeto: Nome do Projeto
 *   Categoria: Nome da Categoria
 *   Faturável: Sim  (ou: Não, Yes, No, true, false)
 */
export function parseCalendarMetadata(description: string | undefined): {
  projectName?: string;
  categoryName?: string;
  billable?: boolean;
} {
  if (!description) return {};

  const project = description.match(/^projeto:\s*(.+)$/im)?.[1]?.trim();
  const category = description.match(/^categoria:\s*(.+)$/im)?.[1]?.trim();
  const billableRaw = description
    .match(/^faturável:\s*(.+)$/im)?.[1]
    ?.trim()
    .toLowerCase();

  let billable: boolean | undefined;
  if (billableRaw !== undefined) {
    billable = billableRaw === "sim" || billableRaw === "yes" || billableRaw === "true";
  }

  return {
    projectName: project || undefined,
    categoryName: category || undefined,
    billable,
  };
}

/**
 * Retorna o primeiro item cujo `name` bate com `query` (case-insensitive, trim).
 * Retorna null se `query` for undefined/vazia ou se não houver match.
 */
export function findByNameCaseInsensitive<T extends { name: string }>(
  query: string | undefined,
  items: T[]
): T | null {
  if (!query) return null;
  const normalized = query.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === normalized) ?? null;
}
