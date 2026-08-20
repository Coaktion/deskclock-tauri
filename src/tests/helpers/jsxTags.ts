/**
 * Leitura de tags JSX para os testes de convenção que precisam olhar o elemento
 * inteiro, e não a linha.
 */

/**
 * Substitui comentários por espaços, preservando as quebras de linha para a
 * numeração não escorregar.
 *
 * Sem isso, o JSDoc que **cita** um elemento — "um `<select>` nativo obrigaria a
 * percorrê-la à mão" — conta como se fosse um. Pior: o bloco comentado sai da
 * varredura no dia em que alguém o comenta, que é exatamente quando ele deixa de
 * ser dívida a cobrar.
 *
 * As strings são consumidas antes, ou o `//` de uma URL abriria comentário.
 * Literal de expressão regular não é tratado: um `/*` dentro de um deles abriria
 * bloco, e nenhum `.tsx` daqui escreve isso.
 */
export function blankComments(source: string): string {
  const blank = (chunk: string) => chunk.replace(/[^\n]/g, " ");
  let out = "";
  let i = 0;

  while (i < source.length) {
    const char = source[i];
    const next = source[i + 1];

    if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      out += blank(source.slice(i, stop));
      i = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      const quote = char;
      out += char;
      i++;
      while (i < source.length) {
        out += source[i];
        if (source[i] === "\\") {
          i++;
          if (i < source.length) out += source[i];
          i++;
          continue;
        }
        if (source[i] === quote) {
          i++;
          break;
        }
        i++;
      }
    } else {
      out += char;
      i++;
    }
  }

  return out;
}

/**
 * Extrai cada `<tag …>` do fonte, com a linha em que abre.
 *
 * Regex sozinha não serve: props como `onKeyDown={(e) => …}` contêm `>`, e um
 * `[^>]*` para no meio do atributo — a tag inteira passaria despercebida. Daí o
 * contador de chaves, que só aceita como fim da tag o `>` fora delas.
 */
export function extractJsxTags(source: string, name: string): { tag: string; line: number }[] {
  const tags: { tag: string; line: number }[] = [];
  const opener = new RegExp(`<${name}\\b`, "g");
  let match: RegExpExecArray | null;

  while ((match = opener.exec(source)) !== null) {
    let depth = 0;
    for (let i = opener.lastIndex; i < source.length; i++) {
      const char = source[i];
      if (char === "{") depth++;
      else if (char === "}") depth--;
      else if (depth > 0 && (char === '"' || char === "'" || char === "`")) {
        // String dentro de uma expressão: pular inteira, para que uma chave ou
        // um `>` literal dentro dela não conte.
        const quote = char;
        i++;
        while (i < source.length && source[i] !== quote) {
          if (source[i] === "\\") i++;
          i++;
        }
      } else if (char === ">" && depth === 0) {
        tags.push({
          tag: source.slice(match.index, i + 1),
          line: source.slice(0, match.index).split("\n").length,
        });
        break;
      }
    }
  }

  return tags;
}
