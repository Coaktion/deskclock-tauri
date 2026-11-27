import type { TaskFieldHint, TaskTextFields } from "./types";

const SEPARATORS = /^[\s/,;|]+|[\s/,;|]+$/g;

function trimSeparators(text: string): string {
  return text.replace(SEPARATORS, "");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * A sigla só conta no começo do texto ou depois de espaço/separador, e seguida
 * de `=`. É o que impede "TOP=3" no meio do nome de ser lido como a sigla `P`.
 * As mais longas vêm primeiro na alternância para `PS=` nunca perder para `P`.
 */
function siglaPattern(hints: TaskFieldHint[]): RegExp | null {
  if (hints.length === 0) return null;
  const alternatives = hints
    .map((h) => h.sigla)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  return new RegExp(`(^|[\\s/,;|])(${alternatives})\\s*=`, "gi");
}

/**
 * O atalho sem provedor: `Alinhamento P=tech int C=dev PS=dev` separa direto em
 * nome e valores. Devolve `null` quando o texto não tem nenhuma sigla
 * conhecida — aí ele é texto livre, e quem decide o que fazer é o chamador.
 *
 * Sigla desconhecida (`X=`) não é sigla: fica no valor anterior, ou no nome.
 * Sigla repetida: a última vence, como num formulário preenchido duas vezes.
 */
export function parseSiglaText(text: string, hints: TaskFieldHint[]): TaskTextFields | null {
  const pattern = siglaPattern(hints);
  if (!pattern) return null;
  const canonical = new Map(hints.map((h) => [h.sigla.toUpperCase(), h.sigla]));

  const marks = [...text.matchAll(pattern)].map((m) => {
    const start = (m.index ?? 0) + m[1].length;
    return {
      sigla: canonical.get(m[2].toUpperCase()) ?? m[2],
      start,
      end: start + m[0].length - m[1].length,
    };
  });
  if (marks.length === 0) return null;

  const fields: Record<string, string> = {};
  marks.forEach((mark, i) => {
    const valueEnd = i + 1 < marks.length ? marks[i + 1].start : text.length;
    const value = trimSeparators(text.slice(mark.end, valueEnd));
    if (value) fields[mark.sigla] = value;
    else delete fields[mark.sigla];
  });

  return { name: trimSeparators(text.slice(0, marks[0].start)), fields };
}
