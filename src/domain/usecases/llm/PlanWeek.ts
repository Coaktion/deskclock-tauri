import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { LlmRateLimits } from "@shared/types/llm";
import { findByNameCaseInsensitive } from "@shared/utils/calendarMetadata";
import {
  buildWeekPlanPrompt,
  WEEK_PLAN_MAX_OUTPUT_TOKENS,
  type ExistingPlannedLine,
  type WeekPlanDay,
} from "./buildWeekPlanPrompt";
import { parseWeekPlanDraft, type WeekPlanDraftTask } from "./parseWeekPlanDraft";

export interface PlanWeekDeps {
  llm: ILlmApi;
}

export interface PlanWeekOptions {
  todayISO: string;
  /** Os dias úteis da semana navegada — é o recorte que o plano pode ocupar. */
  weekDays: WeekPlanDay[];
  projects: Project[];
  categories: Category[];
  existing: ExistingPlannedLine[];
  /** O texto do usuário, cru. */
  request: string;
}

/**
 * Uma tarefa proposta, já com id resolvido — pronta para virar `PlannedTask` se
 * o usuário confirmar, e só então.
 */
export interface WeekPlanDraft {
  name: string;
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  scheduleType: "specific_date" | "recurring";
  scheduleDate: string | null;
  recurringDays: number[] | null;
  startTime?: string;
  endTime?: string;
}

export interface PlanWeekOutcome {
  /**
   * As propostas, em ordem. **Vazio é também a resposta ilegível** — o modelo
   * respondeu, mas não com um plano.
   *
   * Não há erro tipado para esse caso, e é decisão: erro de provedor mora em
   * `infra/` e `domain/` não pode importá-lo, e "respondeu fora do formato" não
   * é falha de transporte. Quem escreve a frase na tela é a apresentação, como
   * em todo o resto da integração.
   */
  drafts: WeekPlanDraft[];
  /** Quantos itens o parser descartou. Ver `WeekPlanDraftParse.discarded`. */
  discarded: number;
  /** A cota que o provedor informou ao responder; ausente se não informou. */
  limits?: LlmRateLimits;
}

/**
 * Um pedido em texto livre vira propostas de tarefa planejada.
 *
 * **Uma requisição, não um lote** — o oposto do `summarizeWorkdays`, e por isso
 * sem teto de dias, sem `skipped` e sem parada no 429. O plano inteiro sai de
 * uma resposta só.
 *
 * **Nada é gravado aqui.** O use case lê catálogo e devolve rascunho; quem
 * escreve no banco é o `importWeekPlan`, depois da revisão. É essa separação que
 * mantém verdadeira a regra da integração de LLM: o modelo propõe, a pessoa
 * decide.
 *
 * **O erro do `ILlmApi` propaga cru.** Chave inválida, cota estourada e rede
 * fora pedem mensagens diferentes, e quem sabe distingui-las é `describeLlmError`.
 */
export async function planWeek(
  deps: PlanWeekDeps,
  options: PlanWeekOptions
): Promise<PlanWeekOutcome> {
  const messages = buildWeekPlanPrompt({
    todayISO: options.todayISO,
    weekDays: options.weekDays,
    projectNames: options.projects.map((project) => project.name),
    categoryNames: options.categories.map((category) => category.name),
    existing: options.existing,
    request: options.request,
  });

  const completion = await deps.llm.complete(messages, {
    maxOutputTokens: WEEK_PLAN_MAX_OUTPUT_TOKENS,
  });

  const { tasks, discarded } = parseWeekPlanDraft(
    completion.text,
    options.weekDays.map((day) => day.dateISO)
  );

  const drafts = tasks.map((task) => toDraft(task, options));
  return completion.limits
    ? { drafts, discarded, limits: completion.limits }
    : { drafts, discarded };
}

function toDraft(task: WeekPlanDraftTask, options: PlanWeekOptions): WeekPlanDraft {
  // O mesmo casamento por nome que o import da Agenda usa. Nome que não casa
  // vira `null`, nunca projeto ou categoria nova: §6.4, e não é um LLM que vai
  // abrir essa exceção.
  const project = findByNameCaseInsensitive(task.projectName, options.projects);
  const category = findByNameCaseInsensitive(task.categoryName, options.categories);

  return {
    name: task.name,
    projectId: project?.id ?? null,
    categoryId: category?.id ?? null,
    // §6.2: quem preenche o faturamento é a categoria escolhida. O que o modelo
    // achou só vale onde não houve categoria para consultar.
    billable: category ? category.defaultBillable : (task.billable ?? false),
    scheduleType: task.scheduleType,
    scheduleDate: task.scheduleDate ?? null,
    recurringDays: task.recurringDays ?? null,
    ...(task.startTime ? { startTime: task.startTime } : {}),
    ...(task.endTime ? { endTime: task.endTime } : {}),
  };
}
