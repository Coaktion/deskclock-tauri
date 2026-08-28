import type { LlmMessage } from "@domain/integrations/ILlmApi";

/** Uma tarefa com lacuna, como o prompt a apresenta. */
export interface GapFillTaskLine {
  /** Id curto (`t1`), não o UUID: o modelo o copia de volta com mais acerto. */
  id: string;
  name: string;
  /** O que falta nesta tarefa: "projeto", "categoria" e rótulos de campo. */
  missing: string[];
}

/** Um campo personalizado de escolha, com as opções que ele aceita. */
export interface GapFillSelectField {
  label: string;
  options: string[];
}

export interface GapFillPromptInput {
  tasks: GapFillTaskLine[];
  projectNames: string[];
  categoryNames: string[];
  selectFields: GapFillSelectField[];
}

/**
 * O teto de saída do preenchimento.
 *
 * A resposta é mais curta que a do plano — id e dois ou três nomes por tarefa,
 * sem nome de tarefa a escrever —, e o número de linhas é o mesmo teto de 20.
 */
export const GAP_FILL_MAX_OUTPUT_TOKENS = 800;

const SYSTEM_PROMPT = `Você completa o cadastro de tarefas já planejadas num app de
controle de horas.

Cada tarefa em <tarefas> traz o que **falta** nela. Responda APENAS com um objeto
JSON, sem cerca de markdown e sem texto antes ou depois, neste formato:

{"tarefas":[{"id":"t1","projeto":"Aktie","categoria":"Reunião","campos":{"Etapa":"Discovery"}}]}

Regras:
- Preencha **somente** o que estiver listado como falta naquela tarefa. Não
  proponha valor para o que não está na lista dela.
- "projeto" e "categoria" só podem ser nomes escritos em <projetos> e
  <categorias>, copiados como estão.
- Em "campos", a chave é o rótulo do campo e o valor é uma das opções que
  <campos> lista para ele, copiada como está.
- Não havendo no nome da tarefa base para escolher, **omita o campo**. Deixar em
  branco é melhor que chutar.
- Tarefa para a qual você não tem nada a propor não entra na resposta.
- Nada além do JSON na resposta.`;

function block(tag: string, content: string): string {
  return `<${tag}>\n${content}\n</${tag}>`;
}

/**
 * As duas mensagens do preenchimento de lacunas. Função pura, como as irmãs.
 *
 * **Tudo o que vem do usuário vai delimitado** — nome de tarefa, de projeto, de
 * categoria, rótulo e opção de campo. Vale aqui, sem atenuação, o que
 * `buildWorkdayPrompt` diz: o nome é digitado e chega ao modelo sem passar por
 * ninguém.
 *
 * **A regra "só o que falta" é escrita aqui e conferida no use case.** O prompt
 * pede; quem garante é `fillPlanGaps`, que descarta proposta para campo que já
 * tem valor. Prompt é pedido, não trava.
 */
export function buildGapFillPrompt(input: GapFillPromptInput): LlmMessage[] {
  const content = [
    block(
      "tarefas",
      input.tasks
        .map((task) => `${task.id} · ${task.name} — falta: ${task.missing.join(", ")}`)
        .join("\n")
    ),
    block("projetos", input.projectNames.join("\n")),
    block("categorias", input.categoryNames.join("\n")),
    block(
      "campos",
      input.selectFields.map((field) => `${field.label}: ${field.options.join(" | ")}`).join("\n")
    ),
  ].join("\n\n");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content },
  ];
}
