import type { ILlmApi } from "@domain/integrations/ILlmApi";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { Task } from "@domain/entities/Task";
import { groupTasks } from "@domain/utils/groupTasks";
import { getLastDayWithTasks } from "@domain/usecases/tasks/GetLastDayWithTasks";
import { buildWorkdayPrompt, type WorkdayTaskLine } from "./buildWorkdayPrompt";

export interface SummarizeWorkdayDeps {
  taskRepo: ITaskRepository;
  llm: ILlmApi;
}

export interface SummarizeWorkdayOptions {
  /** Omitido resume todos os workspaces, como em `getLastDayWithTasks`. */
  workspaceId?: string;
  /**
   * Nome do projeto por id, injetado. O use case não pode alcançar o
   * repositório de projeto sem que `domain/` passe a depender de quem o
   * instancia; a função resolve o nome com o cache que a camada de cima já tem.
   */
  projectNameById: (id: string | null) => string | undefined;
}

export interface WorkdaySummary {
  dateISO: string;
  summary: string;
}

function namedTasks(tasks: Task[]): Task[] {
  return tasks.filter((task) => (task.name ?? "").trim() !== "");
}

function toLine(tasks: Task[], totalSeconds: number, options: SummarizeWorkdayOptions) {
  const [first] = tasks;
  return {
    name: (first.name ?? "").trim(),
    projectName: options.projectNameById(first.projectId),
    durationSeconds: totalSeconds,
  } satisfies WorkdayTaskLine;
}

/**
 * O resumo em texto do último dia com trabalho registrado.
 *
 * Agrupa antes de mandar porque o dia real tem doze linhas "Reunião" de quinze
 * minutos: o modelo receberia a mesma frase doze vezes, gastaria contexto nisso
 * e ainda leria repetição como ênfase. Uma linha com a soma diz o mesmo.
 *
 * Devolve `null` — sem chamar o LLM — quando não há dia com tarefa ou quando o
 * dia só tem tarefas sem nome: não há o que resumir, e a requisição é paga.
 *
 * **Erro do `ILlmApi` propaga.** Chave inválida, rate limit e rede fora pedem
 * mensagens diferentes, e quem sabe distingui-las é a camada de apresentação.
 */
export async function summarizeWorkday(
  deps: SummarizeWorkdayDeps,
  options: SummarizeWorkdayOptions
): Promise<WorkdaySummary | null> {
  const day = await getLastDayWithTasks(deps.taskRepo, options.workspaceId);
  if (!day) return null;

  const lines = groupTasks(namedTasks(day.tasks)).map((group) =>
    toLine(group.tasks, group.totalSeconds, options)
  );
  if (lines.length === 0) return null;

  const summary = await deps.llm.complete(buildWorkdayPrompt(lines));
  return { dateISO: day.dateISO, summary: summary.trim() };
}
