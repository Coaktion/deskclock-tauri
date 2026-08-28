import { isRecord, jsonItemList, textValue } from "./jsonAnswer";

/** O que o modelo propôs para uma tarefa, ainda em nomes. */
export interface GapFillProposal {
  /** O id curto que o prompt usou — `t1`, `t2` —, não o UUID da tarefa. */
  id: string;
  projectName?: string;
  categoryName?: string;
  /** Valor por **rótulo** do campo personalizado. */
  fieldValues: Record<string, string>;
}

export interface GapFillDraftParse {
  proposals: GapFillProposal[];
  discarded: number;
}

/**
 * As propostas de preenchimento de uma resposta de LLM.
 *
 * **O id é conferido contra a lista enviada.** O modelo inventa id, e um id
 * inventado aplicado a esmo escreveria numa tarefa que ninguém revisou — que é
 * o oposto de tudo o que esta integração garante.
 *
 * **Repetição fica com a primeira.** Duas propostas para a mesma tarefa são o
 * modelo se contradizendo; a segunda não tem por que ganhar.
 */
export function parseGapFillDraft(raw: string, allowedIds: string[]): GapFillDraftParse {
  const allowed = new Set(allowedIds);
  const seen = new Set<string>();
  const proposals: GapFillProposal[] = [];
  let discarded = 0;

  for (const item of jsonItemList(raw, "tarefas")) {
    const proposal = toProposal(item, allowed, seen);
    if (proposal) {
      seen.add(proposal.id);
      proposals.push(proposal);
    } else {
      discarded++;
    }
  }

  return { proposals, discarded };
}

function toProposal(
  item: unknown,
  allowed: Set<string>,
  seen: Set<string>
): GapFillProposal | null {
  if (!isRecord(item)) return null;

  const id = textValue(item.id);
  if (!id || !allowed.has(id) || seen.has(id)) return null;

  const projectName = textValue(item.projeto);
  const categoryName = textValue(item.categoria);
  const fieldValues = fieldValuesOf(item.campos);

  // Item que não propõe nada é linha vazia na revisão: some, sem custar um
  // lugar na lista.
  const proposesSomething =
    projectName !== undefined || categoryName !== undefined || Object.keys(fieldValues).length > 0;
  if (!proposesSomething) return null;

  return {
    id,
    ...(projectName ? { projectName } : {}),
    ...(categoryName ? { categoryName } : {}),
    fieldValues,
  };
}

/** Só entrada cujo valor é texto — `true` e `42` não preenchem campo nenhum. */
function fieldValuesOf(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) return {};
  const values: Record<string, string> = {};
  for (const [label, value] of Object.entries(raw)) {
    const text = textValue(value);
    if (text) values[label] = text;
  }
  return values;
}
