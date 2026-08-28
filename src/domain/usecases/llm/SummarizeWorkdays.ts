import { isLlmRateLimitError, type ILlmApi } from "@domain/integrations/ILlmApi";
import type { IDaySummaryRepository } from "@domain/repositories/IDaySummaryRepository";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { LlmRateLimits } from "@shared/types/llm";
import { summarizeWorkday } from "./SummarizeWorkday";

/**
 * Quantos dias uma geração resume, no máximo.
 *
 * No free tier do Groq o gargalo não é o teto diário de requisições — é o de
 * **8 mil tokens por minuto**, e cada dia custa cerca de 1k entre prompt, lista
 * de tarefas e resposta. Cinco chamadas em sequência ficam confortavelmente
 * abaixo dele; o dobro disso encostaria no limite e o lote passaria a falhar no
 * meio, que é o pior lugar para falhar.
 *
 * E cinco dias são uma semana de trabalho: o recorte que alguém de fato quer ler
 * de uma vez.
 */
export const MAX_SUMMARY_DAYS = 5;

/** Um dia resumido, e de onde o texto veio. */
export interface DaySummaryResult {
  dateISO: string;
  summary: string;
  /** `cache` é dia que já estava na tabela — não gastou requisição nenhuma. */
  source: "cache" | "generated";
}

export interface DaySummaryFailure {
  dateISO: string;
  /**
   * O erro **cru** do provedor. Quem o traduz é a apresentação
   * (`describeLlmError`): `domain/` não tem opinião sobre texto de tela.
   */
  error: unknown;
}

/**
 * O que uma geração em lote conseguiu fazer, e o que ficou de fora.
 *
 * Segue o espírito do `TaskSendOutcome` (§ `docs-internal/integracoes/README.md`):
 * o lote é parcial por natureza, e um retorno de "resolveu ou lançou" obrigaria
 * quem chama a jogar fora os dias que deram certo por causa de um que não deu.
 *
 * `failed` e `skipped` são campos separados porque significam coisas opostas.
 * `failed` é o dia que foi **tentado** e não voltou — tem erro para mostrar.
 * `skipped` é o dia que nunca chegou a ser tentado, porque o lote parou num
 * limite de cota: ele não falhou, ele só não foi gerado, e mostrá-lo como erro
 * repetiria a mesma mensagem de 429 em cada linha restante.
 */
export interface SummarizeWorkdaysOutcome {
  /** Um por dia resumido, na ordem em que o lote os percorreu. */
  summaries: DaySummaryResult[];
  failed: DaySummaryFailure[];
  skipped: string[];
  /** A cota informada na última chamada que a devolveu; ausente se nenhuma. */
  limits?: LlmRateLimits;
}

export interface SummarizeWorkdaysDeps {
  taskRepo: ITaskRepository;
  daySummaryRepo: IDaySummaryRepository;
  llm: ILlmApi;
}

export interface SummarizeWorkdaysOptions {
  workspaceId: string;
  /** Os dias candidatos, em qualquer ordem. */
  dateISOs: string[];
  projectNameById: (id: string | null) => string | undefined;
  /**
   * O dia que **ainda não acabou** — na prática, hoje.
   *
   * O cache vale porque dia terminado é fato que não muda: o dia acabou, e as
   * tarefas dele também. O dia corrente não é esse caso — resumi-lo às 9h e
   * guardar o texto deixaria a tela afirmando a manhã pelo resto do dia, e o
   * filtro padrão do Histórico é justamente "Hoje". Ele é o único dia que se
   * regera; o texto continua sendo gravado, e vale a partir de amanhã.
   */
  unfinishedDayISO?: string;
  /**
   * Avisado antes de cada dia, com quantos já ficaram para trás e quantos são
   * ao todo. É o que deixa a tela escrever "gerando 2 de 5" — o lote é
   * sequencial e pode levar dezenas de segundos, e sem sinal de avanço ele é
   * indistinguível de um botão travado.
   */
  onProgress?: (progress: { done: number; total: number }) => void;
}

/** Os `MAX_SUMMARY_DAYS` mais recentes, do mais novo para o mais antigo. */
function mostRecent(dateISOs: string[]): string[] {
  return [...new Set(dateISOs)].sort((a, b) => b.localeCompare(a)).slice(0, MAX_SUMMARY_DAYS);
}

/**
 * Resume vários dias, um de cada vez.
 *
 * **Sequencial, nunca em paralelo.** Cinco chamadas disparadas juntas gastam a
 * cota do minuto de uma vez só e o provedor recusa todas menos as primeiras —
 * em série, elas se espalham pelo tempo que cada resposta leva.
 *
 * **Consulta a tabela antes do provedor.** Dia já resumido é fato que não muda,
 * e regerá-lo pagaria de novo pela mesma cota — é essa economia que torna o teto
 * de dias suportável, e o disparo automático da busca do Histórico junto com
 * ele. A exceção é o `unfinishedDayISO`, que ainda está acontecendo.
 *
 * **Para no primeiro limite de cota.** Insistir contra um 429 é o pior que um
 * cliente pode fazer, e os dias que sobram voltam em `skipped`, não como erro de
 * cada um.
 */
export async function summarizeWorkdays(
  deps: SummarizeWorkdaysDeps,
  options: SummarizeWorkdaysOptions
): Promise<SummarizeWorkdaysOutcome> {
  const days = mostRecent(options.dateISOs);
  const cached = await deps.daySummaryRepo.findByDays(options.workspaceId, days);
  const cachedByDay = new Map(cached.map((entry) => [entry.dateISO, entry.summary]));

  const outcome: SummarizeWorkdaysOutcome = { summaries: [], failed: [], skipped: [] };

  for (const [index, dateISO] of days.entries()) {
    options.onProgress?.({ done: index, total: days.length });
    const hit = dateISO === options.unfinishedDayISO ? undefined : cachedByDay.get(dateISO);
    if (hit !== undefined && hit.trim() !== "") {
      outcome.summaries.push({ dateISO, summary: hit, source: "cache" });
      continue;
    }

    try {
      const result = await summarizeWorkday(
        { taskRepo: deps.taskRepo, llm: deps.llm },
        {
          workspaceId: options.workspaceId,
          dateISO,
          projectNameById: options.projectNameById,
        }
      );
      // `null` é dia sem tarefa nomeada: não há o que resumir e nada foi
      // chamado. Não é sucesso nem falha — a linha simplesmente não existe.
      if (!result) continue;
      if (result.limits) outcome.limits = result.limits;
      await deps.daySummaryRepo.save({
        dateISO: result.dateISO,
        workspaceId: options.workspaceId,
        summary: result.summary,
        generatedAt: new Date().toISOString(),
      });
      outcome.summaries.push({ dateISO, summary: result.summary, source: "generated" });
    } catch (error) {
      outcome.failed.push({ dateISO, error });
      if (isLlmRateLimitError(error)) {
        outcome.skipped.push(...days.slice(index + 1));
        break;
      }
    }
  }

  return outcome;
}
