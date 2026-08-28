import { ArrowRight } from "lucide-react";

import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { PlanGapFill, PlanGapTask } from "@domain/usecases/llm/FillPlanGaps";
import type { Project } from "@domain/entities/Project";
import { selectionBoxClass } from "@presentation/components/selectionStyles";
import { Badge } from "@presentation/components/ui";

interface PlanGapRowProps {
  gap: PlanGapTask;
  /** Ausente enquanto a IA não propôs nada para esta tarefa. */
  fill?: PlanGapFill;
  selected: boolean;
  projects: Project[];
  categories: Category[];
  selectFields: CustomField[];
  onToggleSelect: () => void;
}

/**
 * Uma planejada com lacuna, e o que a IA propôs preencher nela.
 *
 * **A linha não edita, ela aceita ou recusa.** O que se propõe aqui é o valor de
 * um campo vazio: certo, marca-se; errado, desmarca-se e a tarefa segue como
 * estava. Editar planejada já tem uma casa — o modal de edição (§1: edição
 * sempre em modal) —, e um segundo editor aqui seria a terceira grafia do mesmo
 * formulário.
 */
export function PlanGapRow({
  gap,
  fill,
  selected,
  projects,
  categories,
  selectFields,
  onToggleSelect,
}: PlanGapRowProps) {
  const proposals = fill ? describeFill(fill, projects, categories, selectFields) : [];

  return (
    <div className="flex items-start gap-2 px-4 py-2.5 border-b border-border-subtle last:border-0">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelect}
        disabled={proposals.length === 0}
        className={`mt-1 ${selectionBoxClass} disabled:opacity-50 disabled:cursor-not-allowed`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-fg truncate">{gap.task.name}</p>
        {proposals.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {proposals.map((proposal) => (
              <span key={proposal.label} className="flex items-center gap-1 text-xs text-fg-muted">
                {proposal.label}
                <ArrowRight size={14} className="text-fg-muted" />
                <Badge tone="accent">{proposal.value}</Badge>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-fg-muted mt-0.5">
            {fill ? "Nada a propor — preencha à mão." : `Falta: ${gap.missing.join(", ")}`}
          </p>
        )}
      </div>
    </div>
  );
}

/** O que a proposta preenche, em rótulo e valor legíveis. */
function describeFill(
  fill: PlanGapFill,
  projects: Project[],
  categories: Category[],
  selectFields: CustomField[]
): { label: string; value: string }[] {
  const parts: { label: string; value: string }[] = [];

  const project = projects.find((p) => p.id === fill.projectId);
  if (project) parts.push({ label: "Projeto", value: project.name });

  const category = categories.find((c) => c.id === fill.categoryId);
  if (category) parts.push({ label: "Categoria", value: category.name });

  for (const field of selectFields) {
    const optionId = fill.customValues[field.id];
    const option = field.options.find((o) => o.id === optionId);
    if (option) parts.push({ label: field.label, value: option.label });
  }

  return parts;
}
