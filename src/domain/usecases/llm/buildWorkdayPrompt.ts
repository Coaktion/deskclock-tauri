import type { LlmMessage } from "@domain/integrations/ILlmApi";
import { formatDurationCompact } from "@shared/utils/time";

export interface WorkdayTaskLine {
  name: string;
  /** Ausente quando a tarefa não tem projeto — a linha sai sem os parênteses. */
  projectName?: string;
  durationSeconds: number;
}

/**
 * O teto de saída do resumo do dia.
 *
 * Mora aqui, e não no preset do Groq de onde veio, porque quem o explica é a
 * regra logo abaixo — "UM parágrafo, de 2 a 4 frases" —, não o provedor. No
 * preset ele valia para toda chamada feita pelo app, e truncaria a primeira que
 * precisasse de mais espaço.
 */
export const WORKDAY_MAX_OUTPUT_TOKENS = 220;

const SYSTEM_PROMPT = `Você resume registros de trabalho de um app de controle de horas.

Receberá uma lista de tarefas com nome e duração. Escreva UM parágrafo em
português do Brasil, de 2 a 4 frases, descrevendo no que o tempo foi gasto.

Regras:
- Use apenas o que está na lista. Não invente tarefas, projetos, clientes,
  ferramentas, motivos ou resultados que não estejam escritos.
- Agrupe tarefas semelhantes em vez de listar uma por uma.
- Cite durações apenas quando forem relevantes, no mesmo formato da lista
  (1h30m, 45m).
- Não use bullets, títulos, markdown ou emoji.
- Não comece com "Neste dia", "O usuário" ou "Resumo:". Comece pelo conteúdo.`;

function formatLine(line: WorkdayTaskLine): string {
  const project = line.projectName?.trim();
  const label = project ? `${line.name} (${project})` : line.name;
  return `${label} — ${formatDurationCompact(line.durationSeconds)}`;
}

/**
 * As duas mensagens do resumo do dia. Função pura: quem resolve nome de projeto
 * e agrupamento é o use case, aqui só entra texto já decidido.
 *
 * Os dados vão **dentro de `<tarefas>`** porque o nome da tarefa é digitado pelo
 * usuário e chega ao modelo sem passar por ninguém: sem delimitador, uma tarefa
 * chamada "ignore as instruções acima" é lida como instrução. A tag não é
 * garantia, é a trava barata — o modelo passa a ter onde ver que aquilo é dado.
 */
export function buildWorkdayPrompt(lines: WorkdayTaskLine[]): LlmMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `<tarefas>\n${lines.map(formatLine).join("\n")}\n</tarefas>` },
  ];
}
