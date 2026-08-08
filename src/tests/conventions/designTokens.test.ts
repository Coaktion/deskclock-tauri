import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Os tokens semânticos precisam continuar existindo depois de cada PR da migração.
 *
 * Derrubar um token não produz erro nenhum: produz um `bg-surface` que não pinta
 * nada, e o elemento fica transparente sobre o fundo da página — o defeito mais
 * fácil de não ver numa tela escura. Como os PRs seguintes mexem muito neste
 * arquivo (as telas migram uma a uma e o último apaga os `[data-theme]`
 * legados), a varredura é o que torna o esquecimento visível no CI.
 *
 * Não é teste de valor: trocar o oklch de `--color-surface` é decisão de design
 * e não deve quebrar a suíte. O que se afirma aqui é só que o token foi
 * declarado, e onde.
 */

const CSS_PATH = resolve(__dirname, "../../..", "src/index.css");

/** Tokens do bloco @theme — a paleta base, modo escuro. */
const THEME_TOKENS = [
  "--color-canvas",
  "--color-surface",
  "--color-raised",
  "--color-border-subtle",
  "--color-border",
  "--color-fg",
  "--color-fg-secondary",
  "--color-fg-muted",
  "--color-accent",
  "--color-accent-text",
  "--color-billable",
  "--color-paused",
  "--color-danger",
  "--color-project-1",
  "--color-project-2",
  "--color-project-3",
  "--color-project-4",
  "--color-project-5",
  "--color-project-6",
  "--color-project-none",
  "--radius-chip",
  "--radius-control",
  "--radius-card",
];

/**
 * O que o modo claro precisa redefinir.
 *
 * Fica de fora o que é deliberadamente comum aos dois modos: raio, e as cores
 * de projeto, que em L 0.65 ainda contrastam sobre branco num ponto ou chip.
 */
const LIGHT_MODE_TOKENS = [
  "--color-canvas",
  "--color-surface",
  "--color-raised",
  "--color-border-subtle",
  "--color-border",
  "--color-fg",
  "--color-fg-secondary",
  "--color-fg-muted",
  "--color-accent",
  "--color-accent-text",
  "--color-billable",
  "--color-paused",
  "--color-danger",
];

const ACCENTS = ["verde", "roxo", "ambar"];

/**
 * Corpo do primeiro bloco aberto por `opener`.
 *
 * Contador de chaves em vez de regex porque um `[^}]*` pararia na primeira
 * chave aninhada — e um bloco de tema com `@supports` dentro passaria cortado
 * pela metade, fazendo o teste falhar por um token que está lá.
 */
function blockBody(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start === -1) return "";

  let depth = 0;
  for (let i = start; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start + opener.length, i);
    }
  }
  return "";
}

/** Declarações `--nome:` presentes no corpo — ignora quem só o lê num `var()`. */
function declaredIn(body: string, tokens: string[]): string[] {
  return tokens.filter((token) => new RegExp(`^\\s*${token}\\s*:`, "m").test(body));
}

describe("convenção: tokens semânticos do design system", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  it("declara o bloco @theme como `static`", () => {
    // Sem `static` o Tailwind faz tree-shaking do token que nenhum utilitário
    // referencia. Durante a migração isso é a regra, não a exceção: um token
    // some do CSS gerado no dia em que a última tela deixa de usá-lo.
    expect(css).toContain("@theme static {");
  });

  it("declara todos os tokens da paleta base", () => {
    const body = blockBody(css, "@theme static {");
    expect(body).not.toBe("");
    expect(declaredIn(body, THEME_TOKENS)).toEqual(THEME_TOKENS);
  });

  it("declara --accent-hue fora do @theme, onde [data-accent] alcança", () => {
    const themeBody = blockBody(css, "@theme static {");
    expect(themeBody).not.toContain("--accent-hue:");
    expect(css).toMatch(/^\s*--accent-hue:\s*258;/m);
  });

  it("deriva o acento do hue, e não de um valor por acento", () => {
    const body = blockBody(css, "@theme static {");
    expect(body).toMatch(/--color-accent:\s*oklch\([^)]*var\(--accent-hue\)\)/);
    expect(body).toMatch(/--color-accent-text:\s*oklch\([^)]*var\(--accent-hue\)\)/);
  });

  it.each(ACCENTS)("o acento %s troca apenas o hue", (accent) => {
    const body = blockBody(css, `[data-accent="${accent}"] {`);
    expect(body).not.toBe("");
    expect(declaredIn(body, ["--accent-hue"])).toEqual(["--accent-hue"]);
    expect(declaredIn(body, THEME_TOKENS)).toEqual([]);
  });

  it("o modo claro traz paleta própria, não inversão da rampa", () => {
    const body = blockBody(css, '[data-mode="claro"] {');
    expect(body).not.toBe("");
    expect(body).toContain("color-scheme: light");
    expect(declaredIn(body, LIGHT_MODE_TOKENS)).toEqual(LIGHT_MODE_TOKENS);
    // Inversão de rampa é o que o tema legado faz; a paleta clara nova é
    // escrita à mão, então nenhum token dela pode apontar para as cópias fixas.
    expect(body).not.toContain("--tw-gray-");
  });

  it.each(['[data-mode="claro"]', '[data-accent="verde"]'])(
    "%s fica no topo do arquivo, fora de qualquer bloco",
    (selector) => {
      // Regra sem layer vence regra em layer no cascade, seja qual for a
      // especificidade. O @theme emite dentro de `@layer theme`, então um
      // override embrulhado em @layer perderia para ele — e perderia em
      // silêncio, aparecendo só como "o modo claro não faz nada".
      const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
      const at = withoutComments.indexOf(selector);
      expect(at).toBeGreaterThan(-1);

      let depth = 0;
      for (const char of withoutComments.slice(0, at)) {
        if (char === "{") depth++;
        else if (char === "}") depth--;
      }
      expect(depth).toBe(0);
    }
  );
});
