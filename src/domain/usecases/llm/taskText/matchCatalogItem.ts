import { fuzzyMatch } from "@shared/utils/fuzzySearch";
import type { TaskTextCandidate } from "./types";

export const MAX_CANDIDATES = 5;

export type CatalogMatch =
  | { kind: "resolved"; item: TaskTextCandidate }
  | { kind: "ambiguous"; candidates: TaskTextCandidate[] }
  | { kind: "notFound" };

/** Sem acento, sem caixa, espaços colapsados: "Técnico  Interno" e "tecnico interno" são iguais. */
export function normalizeForMatch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function words(normalized: string): string[] {
  return normalized.split(/[^a-z0-9]+/).filter(Boolean);
}

const MIN_SHARED_PREFIX = 4;
const MAX_QUERY_TAIL = 2;
const MAX_TARGET_TAIL = 3;

function sharedPrefixLength(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * A palavra da busca é prefixo da do alvo, ou as duas só diferem na flexão:
 * "interno" → "internas", "reuniao" → "reunioes". O usuário escreve no
 * singular e no masculino o que o catálogo tem no plural ou no feminino.
 *
 * A flexão é medida **dos dois lados** — raiz comum de 4+ letras, sobra curta
 * na busca e no alvo. Só a raiz e a sobra da busca deixariam "interno" casar
 * "intervalo" ("inter" + "no"), e a leitura por posição tomaria o trecho pelo
 * campo errado.
 */
function wordMatches(queryWord: string, targetWord: string): boolean {
  if (targetWord.startsWith(queryWord)) return true;
  const shared = sharedPrefixLength(queryWord, targetWord);
  return (
    shared >= MIN_SHARED_PREFIX &&
    queryWord.length - shared <= MAX_QUERY_TAIL &&
    targetWord.length - shared <= MAX_TARGET_TAIL
  );
}

/** Cada palavra da busca casa uma palavra do alvo, na mesma ordem: "tech int" → "Tech interno". */
function wordPrefixMatch(queryWords: string[], targetWords: string[]): boolean {
  let ti = 0;
  for (const qw of queryWords) {
    while (ti < targetWords.length && !wordMatches(qw, targetWords[ti])) ti++;
    if (ti === targetWords.length) return false;
    ti++;
  }
  return true;
}

const EXACT = 3;
const PREFIX = 2;
const FUZZY = 1;
const NONE = 0;

function score(query: string, queryWords: string[], target: string): number {
  if (query === target) return EXACT;
  if (wordPrefixMatch(queryWords, words(target))) return PREFIX;
  if (fuzzyMatch(query.replace(/ /g, ""), target)) return FUZZY;
  return NONE;
}

/**
 * O trecho bate com algum item por igualdade ou prefixo de palavras — sem o
 * fuzzy. É a prova que a leitura por posição usa para decidir o campo: frouxa
 * como o fuzzy, um nome longo de projeto engoliria qualquer trecho curto.
 */
export function matchesStrictly(query: string, items: TaskTextCandidate[]): boolean {
  const normalized = normalizeForMatch(query);
  const queryWords = words(normalized);
  if (queryWords.length === 0) return false;
  return items.some(
    (item) => score(normalized, queryWords, normalizeForMatch(item.label)) >= PREFIX
  );
}

/**
 * Casa o que o usuário escreveu com uma lista do catálogo.
 *
 * **Só o melhor nível conta**: um exato não fica ambíguo porque o fuzzy, que é
 * frouxo de propósito, também bateu em outros dez. Dentro do melhor nível, mais
 * de um é ambíguo — escolher sozinho seria trocar o projeto do cliente em
 * silêncio, e a prévia existe para o usuário decidir.
 */
export function matchCatalogItem(query: string, items: TaskTextCandidate[]): CatalogMatch {
  const normalized = normalizeForMatch(query);
  const queryWords = words(normalized);
  if (queryWords.length === 0) return { kind: "notFound" };

  let best = NONE;
  let matches: TaskTextCandidate[] = [];
  for (const item of items) {
    const s = score(normalized, queryWords, normalizeForMatch(item.label));
    if (s === NONE || s < best) continue;
    if (s > best) {
      best = s;
      matches = [];
    }
    matches.push(item);
  }

  if (matches.length === 0) return { kind: "notFound" };
  if (matches.length === 1) return { kind: "resolved", item: matches[0] };
  return { kind: "ambiguous", candidates: matches.slice(0, MAX_CANDIDATES) };
}
