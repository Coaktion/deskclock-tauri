import type { UUID } from "@shared/types";
import { namedCandidates, optionCandidates } from "./candidates";
import { matchCatalogItem, matchesStrictly } from "./matchCatalogItem";
import { parseBillable, parseCheckbox } from "./parseYesNo";
import { categoriesInScope } from "./resolveTaskFields";
import type { TaskFieldHint, TaskTextCatalog, TaskTextFields } from "./types";

const SEGMENT_SEPARATOR = /[,;]/;

/**
 * `b`/`nb` e sim/não são palavras reservadas: valem para o campo de sim/não
 * mesmo que um nome do catálogo também as contenha ("Development NB").
 */
function isYesNoFit(segment: string, hint: TaskFieldHint): boolean {
  if (hint.kind === "billable") return parseBillable(segment) !== null;
  if (hint.kind === "checkbox") return parseCheckbox(segment) !== null;
  return false;
}

/**
 * O trecho cabe no campo quando o catálogo (exato ou prefixo de palavras, sem
 * fuzzy) ou o sim/não o reconhece. Campo de texto aceita qualquer coisa, então
 * não serve de prova — ele é tratado à parte.
 */
function fits(
  segment: string,
  hint: TaskFieldHint,
  projectId: UUID | null,
  catalog: TaskTextCatalog
): boolean {
  switch (hint.kind) {
    case "project":
      return matchesStrictly(segment, namedCandidates(catalog.projects));
    case "category":
      return matchesStrictly(segment, namedCandidates(categoriesInScope(projectId, catalog)));
    case "billable":
    case "checkbox":
      return isYesNoFit(segment, hint);
    case "select": {
      const field = catalog.customFields.find((f) => f.id === hint.fieldId);
      return field ? matchesStrictly(segment, optionCandidates(field)) : false;
    }
    default:
      return false;
  }
}

function indexFrom(
  hints: TaskFieldHint[],
  cursor: number,
  predicate: (hint: TaskFieldHint) => boolean
): number {
  for (let i = cursor; i < hints.length; i++) {
    if (predicate(hints[i])) return i;
  }
  return -1;
}

/**
 * O atalho por posição: `Revisão, CX Atividades, 1:1, nb` é nome e depois os
 * campos na ordem da instrução, separados por vírgula ou ponto e vírgula.
 *
 * **Pular campo é permitido**: cada trecho vai para o primeiro campo, a partir
 * do último preenchido, que o reconhece — "Development" depois do projeto cai na
 * Categoria, e depois da Categoria cai no Project Stage. Trecho que nenhum campo
 * reconhece fica no campo da vez, para aparecer como "não encontrado" na prévia
 * em vez de sumir.
 *
 * Devolve `null` quando nenhum trecho depois do nome foi reconhecido: "Reunião
 * com o time, sobre a sprint" é texto livre, e quem decide é o chamador. Campo
 * de texto não conta como reconhecimento pelo mesmo motivo — aceitaria a frase.
 *
 * Limite conhecido: nome de projeto com vírgula se parte em dois. Digitar um
 * pedaço do nome funciona; o nome inteiro pede `P=`.
 */
export function parseOrderedText(
  text: string,
  hints: TaskFieldHint[],
  catalog: TaskTextCatalog
): TaskTextFields | null {
  const segments = text
    .split(SEGMENT_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;

  const [name, ...values] = segments;
  const fields: Record<string, string> = {};
  let projectId: UUID | null = null;
  let recognized = false;
  let cursor = 0;

  for (const segment of values) {
    // Trechos além do último campo não têm para onde ir: ficam de fora, como
    // valor de um campo que a tela não tem.
    if (cursor >= hints.length) break;

    let index = indexFrom(hints, cursor, (h) => isYesNoFit(segment, h));
    if (index < 0) index = indexFrom(hints, cursor, (h) => fits(segment, h, projectId, catalog));
    // Não reconhecido fica no campo da vez: num de escolha, a prévia o mostra
    // como "não encontrado". Saltar até um campo de texto mais à frente levaria
    // o cursor junto e descartaria calados os trechos seguintes — e trecho não
    // reconhecido é quase sempre erro de digitação. Campo de texto se preenche
    // na própria posição, ou por sigla.
    if (index >= 0) recognized = true;
    else index = cursor;

    const hint = hints[index];
    fields[hint.sigla] = segment;
    if (hint.kind === "project") {
      const match = matchCatalogItem(segment, namedCandidates(catalog.projects));
      projectId = match.kind === "resolved" ? match.item.id : null;
    }
    cursor = index + 1;
  }

  return recognized ? { name, fields } : null;
}
