import { isRecord, jsonItemList, textValue } from "./jsonAnswer";

/**
 * Quantas tarefas um plano pode trazer.
 *
 * Não é limite de produto, é trava contra resposta em fuga: um pedido vago
 * ("planeje minha semana") faz o modelo listar até cansar, e vinte linhas já são
 * mais do que alguém revisa numa sentada. Casa com o
 * `WEEK_PLAN_MAX_OUTPUT_TOKENS` pelo outro lado.
 */
export const MAX_PLAN_TASKS = 20;

/** Uma tarefa proposta, ainda em nomes — quem resolve id é o use case. */
export interface WeekPlanDraftTask {
  name: string;
  projectName?: string;
  categoryName?: string;
  billable?: boolean;
  scheduleType: "specific_date" | "recurring";
  scheduleDate?: string;
  /** 1=Seg…5=Sex, na escala do `Date`, já sem fim de semana. */
  recurringDays?: number[];
  startTime?: string;
  endTime?: string;
}

export interface WeekPlanDraftParse {
  tasks: WeekPlanDraftTask[];
  /**
   * Quantos itens da resposta não viraram tarefa.
   *
   * A tela **não** mostra este número: o usuário nunca soube que aquele item
   * existia, e anunciar "3 propostas descartadas" é ruído sobre algo que ele não
   * pode conferir. Ele existe porque o teste precisa dele.
   */
  discarded: number;
}

const TIME = /^(\d{1,2}):([0-5]\d)$/;

/**
 * A lista de tarefas de uma resposta de LLM, com tudo o que não cabe na semana
 * já descartado.
 *
 * **O parser não confia na resposta.** Não há `response_format` no request — o
 * corpo é o subconjunto que todos os onze provedores aceitam —, então o formato
 * é combinado só no prompt, e prompt é pedido, não garantia. Cerca de markdown,
 * prosa em volta, sábado no `dia`, hora inventada: tudo isso chega, e chega
 * calado.
 *
 * **O descarte é por item, nunca do plano inteiro.** Uma linha torta entre dez
 * boas não pode custar as nove — o usuário perderia o plano por causa de algo
 * que ele nem pediu.
 *
 * **E o descarte é na origem.** É a lição do import da Agenda: o evento de
 * sábado escondido só na renderização continuava selecionado, contado no botão e
 * importado do mesmo jeito.
 */
export function parseWeekPlanDraft(raw: string, weekDays: string[]): WeekPlanDraftParse {
  const items = jsonItemList(raw, "tarefas");
  const allowedDays = new Set(weekDays);

  const tasks: WeekPlanDraftTask[] = [];
  let discarded = 0;

  for (const item of items) {
    const task = toTask(item, allowedDays);
    if (task && tasks.length < MAX_PLAN_TASKS) tasks.push(task);
    else discarded++;
  }

  return { tasks, discarded };
}

/** Um item da resposta como tarefa, ou `null` quando ele não cabe na semana. */
function toTask(item: unknown, allowedDays: Set<string>): WeekPlanDraftTask | null {
  if (!isRecord(item)) return null;

  const name = textValue(item.nome);
  if (!name) return null;

  const schedule = scheduleOf(item, allowedDays);
  if (!schedule) return null;

  const startTime = time(item.inicio);
  // Fim sem início não descreve nada: não há de onde contar, e o par é o que a
  // planejada guarda.
  const endTime = startTime ? time(item.fim) : undefined;

  return {
    name,
    ...schedule,
    ...(textValue(item.projeto) ? { projectName: textValue(item.projeto) } : {}),
    ...(textValue(item.categoria) ? { categoryName: textValue(item.categoria) } : {}),
    ...(typeof item.faturavel === "boolean" ? { billable: item.faturavel } : {}),
    ...(startTime ? { startTime } : {}),
    ...(endTime ? { endTime } : {}),
  };
}

/**
 * O agendamento do item, ou `null` quando ele não tem lugar na semana.
 *
 * `dia` ganha de `dias` quando os dois vêm: uma data é mais específica que uma
 * recorrência, e o modelo que mandou os dois já se contradisse — escolher o
 * recorte menor é o erro mais barato.
 */
function scheduleOf(
  item: Record<string, unknown>,
  allowedDays: Set<string>
): Pick<WeekPlanDraftTask, "scheduleType" | "scheduleDate" | "recurringDays"> | null {
  const day = textValue(item.dia);
  if (day) {
    return allowedDays.has(day)
      ? { scheduleType: "specific_date", scheduleDate: day }
      : // Fora da semana navegada, inclusive sábado e domingo, que nunca estão
        // na lista permitida.
        null;
  }

  if (!Array.isArray(item.dias)) return null;
  const days = [...new Set(item.dias.filter(isWeekday))].sort((a, b) => a - b);
  return days.length > 0 ? { scheduleType: "recurring", recurringDays: days } : null;
}

/** 1=Seg…5=Sex, na escala do `Date` — o fim de semana não existe no planejamento. */
function isWeekday(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

/** "HH:MM", tolerando a hora de um dígito que o modelo escreve o tempo todo. */
function time(value: unknown): string | undefined {
  const match = TIME.exec(textValue(value) ?? "");
  if (!match) return undefined;
  const hour = Number(match[1]);
  return hour <= 23 ? `${String(hour).padStart(2, "0")}:${match[2]}` : undefined;
}
