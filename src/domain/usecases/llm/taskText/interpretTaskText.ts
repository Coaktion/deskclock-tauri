import type { ILlmApi } from "@domain/integrations/ILlmApi";
import { buildTaskTextPrompt } from "./buildTaskTextPrompt";
import { parseSiglaText } from "./parseSiglaText";
import { parseTaskTextResponse } from "./parseTaskTextResponse";
import { resolveTaskFields } from "./resolveTaskFields";
import type { TaskFieldHint, TaskTextCatalog, TaskTextInterpretation } from "./types";

export interface InterpretTaskTextInput {
  /** `null` quando não há provedor conectado. */
  llm: ILlmApi | null;
  text: string;
  hints: TaskFieldHint[];
  catalog: TaskTextCatalog;
}

/**
 * O texto digitado → a tarefa preenchida para a prévia.
 *
 * Três caminhos, nesta ordem:
 * 1. **Com sigla** (`P=…`), separa localmente e **não chama o provedor** — o
 *    usuário já disse o que é cada coisa, e a requisição é paga.
 * 2. **Texto livre com provedor**: ele só separa os trechos; o casamento com o
 *    catálogo continua local.
 * 3. **Sem provedor**: o texto inteiro vira o nome, que é o que o campo fazia
 *    antes desta feature.
 *
 * **Erro do `ILlmApi` propaga**, como no resumo do dia: quem sabe o que dizer
 * ao usuário sobre chave, cota ou rede é a apresentação.
 */
export async function interpretTaskText(
  input: InterpretTaskTextInput
): Promise<TaskTextInterpretation> {
  const text = input.text.trim();
  const viaSiglas = parseSiglaText(text, input.hints);
  if (viaSiglas || !text) {
    return resolveTaskFields(
      viaSiglas ?? { name: "", fields: {} },
      input.hints,
      input.catalog,
      "local"
    );
  }

  if (!input.llm) {
    return resolveTaskFields({ name: text, fields: {} }, input.hints, input.catalog, "local");
  }

  const completion = await input.llm.complete(buildTaskTextPrompt(text, input.hints));
  const parsed = parseTaskTextResponse(completion.text, input.hints);
  return resolveTaskFields(parsed, input.hints, input.catalog, "llm");
}
