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
  const items = listOf(raw);
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

/** Os itens da resposta, ou lista vazia se não houver JSON legível nela. */
function listOf(raw: string): unknown[] {
  const json = extractJson(raw);
  if (json === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return [];
  if (Array.isArray(parsed.tarefas)) return parsed.tarefas;
  // O modelo às vezes embrulha a lista sob outro nome ("plano", "items"). A
  // lista é uma só: procurá-la pelo tipo custa menos que adivinhar o nome.
  return Object.values(parsed).find(Array.isArray) ?? [];
}

/**
 * O primeiro valor JSON balanceado do texto.
 *
 * Resolve de uma vez a cerca de markdown, o "Claro! Aqui está:" antes e o
 * "Espero ter ajudado" depois — as três formas em que a resposta chega suja. As
 * aspas são respeitadas, ou uma tarefa chamada "Revisar [PRs] do {backend}"
 * fecharia o objeto no lugar errado.
 */
function extractJson(raw: string): string | null {
  const start = raw.search(/[{[]/);
  if (start === -1) return null;

  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close && --depth === 0) return raw.slice(start, i + 1);
  }
  return null;
}

/** Um item da resposta como tarefa, ou `null` quando ele não cabe na semana. */
function toTask(item: unknown, allowedDays: Set<string>): WeekPlanDraftTask | null {
  if (!isRecord(item)) return null;

  const name = text(item.nome);
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
    ...(text(item.projeto) ? { projectName: text(item.projeto) } : {}),
    ...(text(item.categoria) ? { categoryName: text(item.categoria) } : {}),
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
  const day = text(item.dia);
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

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** "HH:MM", tolerando a hora de um dígito que o modelo escreve o tempo todo. */
function time(value: unknown): string | undefined {
  const match = TIME.exec(text(value) ?? "");
  if (!match) return undefined;
  const hour = Number(match[1]);
  return hour <= 23 ? `${String(hour).padStart(2, "0")}:${match[2]}` : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
