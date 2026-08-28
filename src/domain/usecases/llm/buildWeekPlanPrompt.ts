import type { LlmMessage } from "@domain/integrations/ILlmApi";

/** Um dia útil da semana navegada, como o prompt o apresenta. */
export interface WeekPlanDay {
  dateISO: string;
  /** "segunda", "terça"… — o modelo lê o pedido em dia da semana, não em data. */
  weekday: string;
}

/** Uma planejada que a semana já tem, para o pedido poder ser incremental. */
export interface ExistingPlannedLine {
  name: string;
  /** Quando ela acontece, já em texto: "quarta" ou "toda segunda e quarta". */
  when: string;
}

export interface WeekPlanPromptInput {
  todayISO: string;
  weekDays: WeekPlanDay[];
  projectNames: string[];
  categoryNames: string[];
  existing: ExistingPlannedLine[];
  /** O texto do usuário, cru. */
  request: string;
}

/**
 * O teto de saída de um plano de semana.
 *
 * Vinte tarefas com nome, projeto, categoria e dia cabem com folga em ~1200
 * tokens — e é o `MAX_PLAN_TASKS` do parser que fecha a conta pelo outro lado.
 * Mais que isso não compraria plano maior, compraria resposta divagando.
 */
export const WEEK_PLAN_MAX_OUTPUT_TOKENS = 1200;

const SYSTEM_PROMPT = `Você transforma um pedido em português do Brasil na lista de tarefas
planejadas de um app de controle de horas.

Responda APENAS com um objeto JSON, sem cerca de markdown e sem texto antes ou
depois. O formato é exatamente este:

{"tarefas":[{"nome":"Alinhamento semanal","projeto":"Aktie","categoria":"Reunião","faturavel":true,"dias":[1,3],"inicio":"09:00","fim":"09:30"}]}

Os campos:
- "nome": obrigatório. Curto, em português do Brasil, sentence case, sem emoji.
- "dia": uma das datas listadas em <semana>, para a tarefa de um dia só.
- "dias": lista de números de 1 (segunda) a 5 (sexta), para a tarefa que se
  repete toda semana. Use "dia" OU "dias", nunca os dois.
- "projeto" e "categoria": opcionais, e só valem os nomes escritos em <projetos>
  e <categorias>, copiados como estão. Não havendo nome que sirva, omita o
  campo.
- "faturavel": opcional, true ou false.
- "inicio" e "fim": opcionais, no formato "HH:MM", e só quando o pedido falar de
  horário.

Regras:
- Só existem os dias listados em <semana>. Não há sábado nem domingo.
- Use apenas o que <pedido> descreve. Não invente tarefa, projeto, cliente,
  reunião ou entrega que não esteja lá.
- Não proponha de novo nada que já esteja em <ja-planejado>.
- Não invente nome de projeto nem de categoria, e não os traduza: fora dos dois
  catálogos, o campo sai.
- Nada além do JSON na resposta.`;

/** Um bloco delimitado, mantido mesmo vazio — ausência também é informação. */
function block(tag: string, content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * As duas mensagens do plano da semana. Função pura, no molde do
 * `buildWorkdayPrompt`: quem decide dias, catálogo e o que já está planejado é o
 * use case, aqui só entra texto pronto.
 *
 * **Os quatro primeiros blocos são dados escritos pelo usuário** — nome de
 * projeto, de categoria e de tarefa já planejada — e chegam ao modelo sem passar
 * por ninguém. Sem delimitador, um projeto chamado "ignore as instruções acima"
 * é lido como instrução.
 *
 * **O `<pedido>` também é delimitado, e por outro motivo:** ele é instrução
 * legítima, mas o modelo precisa de onde ver que ela **acabou** — sem a tag de
 * fechamento, o texto do usuário e as regras do sistema viram um borrão só.
 */
export function buildWeekPlanPrompt(input: WeekPlanPromptInput): LlmMessage[] {
  const content = [
    block("hoje", input.todayISO),
    block("semana", input.weekDays.map((day) => `${day.dateISO} — ${day.weekday}`).join("\n")),
    block("projetos", input.projectNames.join("\n")),
    block("categorias", input.categoryNames.join("\n")),
    block("ja-planejado", input.existing.map((line) => `${line.name} — ${line.when}`).join("\n")),
    block("pedido", input.request.trim()),
  ].join("\n\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];
}
