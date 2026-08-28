import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { LlmRateLimits } from "@shared/types/llm";
import { findByNameCaseInsensitive } from "@shared/utils/calendarMetadata";
import {
  buildGapFillPrompt,
  GAP_FILL_MAX_OUTPUT_TOKENS,
  type GapFillTaskLine,
} from "./buildGapFillPrompt";
import { parseGapFillDraft } from "./parseGapFillDraft";

/** Uma tarefa da semana que tem o que preencher, e o que falta nela. */
export interface PlanGapTask {
  task: PlannedTask;
  /** "projeto", "categoria" e os rótulos dos campos vazios, em ordem de leitura. */
  missing: string[];
}

/** O que preencher numa tarefa. Só campos que estavam **vazios**. */
export interface PlanGapFill {
  taskId: string;
  projectId?: string;
  categoryId?: string;
  /** Por id do campo → id da opção, que é o que fica gravado. */
  customValues: CustomValues;
}

export interface FillPlanGapsOutcome {
  fills: PlanGapFill[];
  discarded: number;
  limits?: LlmRateLimits;
}

export interface FillPlanGapsDeps {
  llm: ILlmApi;
}

export interface FillPlanGapsOptions {
  /** As planejadas da semana que está na tela. O recorte é feito aqui dentro. */
  tasks: PlannedTask[];
  projects: Project[];
  categories: Category[];
  /**
   * Só campos personalizados de **escolha**, ativos.
   *
   * `text`, `multiline` e `checkbox` ficam de fora, e é decisão: neles o modelo
   * escreveria conteúdo livre no campo de alguém, sem lista contra a qual a
   * resposta possa ser conferida. Projeto, categoria e opção de `select` são
   * escolhas de um catálogo fechado — ali "alucinação" é um nome que não casa,
   * e o parser a descarta.
   */
  selectFields: CustomField[];
}

/** Campo de escolha sem valor gravado. Ausente e string vazia são a mesma coisa. */
function isFieldEmpty(values: CustomValues, field: CustomField): boolean {
  return (values[field.id] ?? "").trim() === "";
}

/**
 * As tarefas que têm lacuna **preenchível**, e o que falta em cada uma.
 *
 * O recorte é o que mantém a lista curta e acionável: tarefa completa não tem o
 * que revisar, e tarefa **sem nome** não dá ao modelo do que inferir — ele
 * chutaria a partir do nada, que é o pior uso possível de uma requisição.
 */
export function tasksWithGaps(tasks: PlannedTask[], selectFields: CustomField[]): PlanGapTask[] {
  const gaps: PlanGapTask[] = [];
  for (const task of tasks) {
    if (task.name.trim() === "") continue;
    const missing = [
      ...(task.projectId === null ? ["projeto"] : []),
      ...(task.categoryId === null ? ["categoria"] : []),
      ...selectFields.filter((f) => isFieldEmpty(task.customValues, f)).map((f) => f.label),
    ];
    if (missing.length > 0) gaps.push({ task, missing });
  }
  return gaps;
}

/**
 * A IA propõe o que falta nas planejadas da semana — e **só** o que falta.
 *
 * **Nada que o usuário escolheu à mão é tocado.** A regra está escrita no
 * prompt e conferida aqui: proposta para campo que já tem valor é descartada,
 * porque prompt é pedido e não trava. É a mesma linha que separa esta feature do
 * plano da semana — lá o modelo propõe linhas novas, aqui ele completa as que já
 * existem, e completar nunca é sobrescrever.
 *
 * **Sem lacuna, não há chamada.** A requisição é paga e não teria o que
 * preencher.
 */
export async function fillPlanGaps(
  deps: FillPlanGapsDeps,
  options: FillPlanGapsOptions
): Promise<FillPlanGapsOutcome> {
  const gaps = tasksWithGaps(options.tasks, options.selectFields);
  if (gaps.length === 0) return { fills: [], discarded: 0 };

  // Id curto no prompt, UUID de volta aqui: o modelo copia `t1` com mais acerto
  // que 36 caracteres de hexadecimal, e um id copiado errado é uma escrita na
  // tarefa errada.
  const lines: GapFillTaskLine[] = gaps.map((gap, index) => ({
    id: `t${index + 1}`,
    name: gap.task.name,
    missing: gap.missing,
  }));
  const gapByShortId = new Map(lines.map((line, index) => [line.id, gaps[index]]));

  const messages = buildGapFillPrompt({
    tasks: lines,
    projectNames: options.projects.map((project) => project.name),
    categoryNames: options.categories.map((category) => category.name),
    selectFields: options.selectFields.map((field) => ({
      label: field.label,
      options: field.options.map((option) => option.label),
    })),
  });

  const completion = await deps.llm.complete(messages, {
    maxOutputTokens: GAP_FILL_MAX_OUTPUT_TOKENS,
  });

  const { proposals, discarded } = parseGapFillDraft(
    completion.text,
    lines.map((line) => line.id)
  );

  const fills: PlanGapFill[] = [];
  for (const proposal of proposals) {
    const gap = gapByShortId.get(proposal.id);
    if (!gap) continue;
    const fill = toFill(gap, proposal, options);
    if (fill) fills.push(fill);
  }

  return completion.limits ? { fills, discarded, limits: completion.limits } : { fills, discarded };
}

function toFill(
  gap: PlanGapTask,
  proposal: { projectName?: string; categoryName?: string; fieldValues: Record<string, string> },
  options: FillPlanGapsOptions
): PlanGapFill | null {
  const { task } = gap;

  // Só onde estava vazio. O `??` não bastaria: o modelo devolve o campo mesmo
  // sem ter sido perguntado, e o que o usuário escolheu não se toca.
  const project =
    task.projectId === null
      ? findByNameCaseInsensitive(proposal.projectName, options.projects)
      : null;
  const category =
    task.categoryId === null
      ? findByNameCaseInsensitive(proposal.categoryName, options.categories)
      : null;

  const customValues: CustomValues = {};
  for (const field of options.selectFields) {
    if (!isFieldEmpty(task.customValues, field)) continue;
    const label = proposal.fieldValues[field.label];
    // A opção tem de existir **naquele** campo: fora da lista, o valor gravado
    // seria um id que o seletor não sabe desenhar.
    const option = findByNameCaseInsensitive(
      label,
      field.options.map((o) => ({ id: o.id, name: o.label }))
    );
    if (option) customValues[field.id] = option.id;
  }

  const fillsSomething =
    project !== null || category !== null || Object.keys(customValues).length > 0;
  if (!fillsSomething) return null;

  return {
    taskId: task.id,
    ...(project ? { projectId: project.id } : {}),
    ...(category ? { categoryId: category.id } : {}),
    customValues,
  };
}
