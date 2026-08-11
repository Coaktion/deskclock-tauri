import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve as classes do Tailwind de um elemento para as medidas em px que elas
 * produzem, para o teste de geometria poder comparar componente e spec no mesmo
 * vocabulário.
 *
 * Existe porque o jsdom não faz layout: `getComputedStyle` devolve a classe, não
 * o valor — e o valor é justamente o que as duas primeiras rodadas nunca
 * compararam. `gap-2` e `gap: 0.625rem` são a mesma prosa ("gap pequeno") e dois
 * números diferentes.
 *
 * **Classe desconhecida é erro, não silêncio.** É a regra que sustenta o resto:
 * um resolvedor que ignora o que não reconhece transforma cada classe nova em
 * assertiva aprovada por ignorância — que é exatamente como as travas anteriores
 * ficaram verdes sobre um layout aproximado. Classe que não carrega medida entra
 * em `IGNORED` de propósito, uma por uma.
 */

const CSS = readFileSync(resolve(__dirname, "../../..", "src/index.css"), "utf8");

/** Raiz do app; é dela que dependem os degraus da escala e os raios. */
const ROOT_FONT_SIZE = 16;

/** `--spacing` não foi reancorado (decisão do PR 6.5): segue o padrão. */
const SPACING = 4;

function cssNumber(token: string): number | undefined {
  const found = new RegExp(`^\\s*${token}:\\s*([0-9.]+)(rem|px)?;`, "m").exec(CSS);
  if (!found) return undefined;
  const value = Number(found[1]);
  return found[2] === "px" ? value : value * ROOT_FONT_SIZE;
}

function cssRaw(token: string): string | undefined {
  return new RegExp(`^\\s*${token}:\\s*([^;]+);`, "m").exec(CSS)?.[1]?.trim();
}

/** A escala tipográfica, lida do `@theme` — não duplicada aqui. */
const DECLARED_TEXT_SIZES = Object.fromEntries(
  ["nav", "micro", "overline", "xs", "sm", "body", "lead", "metric"]
    .map((step) => [step, cssNumber(`--text-${step}`)] as const)
    .filter((entry): entry is [string, number] => entry[1] !== undefined)
);

/** Degraus que o app não redeclara e o Tailwind define — 16/18/20/24. */
const TAILWIND_TEXT_SIZES: Record<string, number> = { base: 16, lg: 18, xl: 20, "2xl": 24 };

const TEXT_SIZES: Record<string, number> = { ...TAILWIND_TEXT_SIZES, ...DECLARED_TEXT_SIZES };

const RADII: Record<string, number> = {
  chip: cssNumber("--radius-chip") ?? 6,
  control: cssNumber("--radius-control") ?? 8,
  card: cssNumber("--radius-card") ?? 12,
  none: 0,
  /**
   * Fora da escala de três raios, e de propósito: é a micromarca de 2 a 8 px
   * — o tique da caixa, a barra da linha do tempo, o retalho do rótulo
   * entalhado. Não vem de token do app; o valor é o padrão do Tailwind. Está
   * aqui em vez de levantar porque um elemento que a carrega ainda precisa ter
   * as outras medidas lidas.
   */
  sm: 4,
  /** No spec o raio total aparece como `99px`; aqui o Tailwind emite `9999px`. */
  full: 9999,
};

/**
 * Peso é número puro, não medida: `cssNumber` trataria `500` como `500rem` e
 * devolveria 8000. Foi o primeiro defeito que esta trava pegou — nela mesma.
 */
const WEIGHTS: Record<string, number> = {
  normal: Number(cssRaw("--font-weight-normal") ?? 400),
  medium: Number(cssRaw("--font-weight-medium") ?? 500),
  semibold: Number(cssRaw("--font-weight-semibold") ?? 600),
};

/**
 * Classes que não carregam medida geométrica. Cada entrada é uma decisão: se uma
 * classe nova aparecer e não estiver aqui nem tratada abaixo, o resolvedor
 * levanta — e alguém precisa dizer em qual dos dois lados ela mora.
 *
 * Cor fica fora de propósito: `text-fg-muted` contra `oklch(0.60 0.02 264)` é
 * comparação de token contra valor, e o `meaningColors.test.ts` já cobre o lado
 * que importa (cor crua). Medida em porcentagem (`w-full`) também fica fora — o
 * spec compara px, e `100%` não é px.
 */
const IGNORED = [
  /^(group|relative|absolute|static|fixed|sticky)$/,
  /^(flex-col|flex-row|flex-wrap|flex-1|flex-none|flex-shrink-0)$/,
  /^(justify|self|content|place)-/,
  /^(shrink|grow)(-0)?$/,
  /^(truncate|whitespace-nowrap|overflow-hidden|overflow-visible|overflow-y-auto|overflow-x-auto)$/,
  /^(cursor|select|pointer-events|transition|duration|ease|animate)-/,
  /^(uppercase|lowercase|capitalize|tabular-nums)$/,
  /^leading-/,
  /^tracking-/,
  /^(font-mono|font-sans)$/,
  /^(bg|text|border|ring|divide|from|to|via|outline|placeholder|fill|stroke|shadow)-/,
  /^(divide|space)-[xy]$/,
  /^(z|order|opacity|aria|data)-/,
  /** Posição na grade: diz em que célula o filho cai, não que medida ele tem. */
  /^(col|row)-(start|end|span|auto)/,
  /^(focus|hover|active|disabled|group-hover|group-focus-within|focus-within|focus-visible|peer|first|last)[:-]/,
  /^(sr-only|not-sr-only|appearance-none|resize-none|antialiased)$/,
  /^(min|max)-[wh]-/,
  /** Posição, não medida — inclusive negativa: o `-top-2` do rótulo entalhado. */
  /^-?(top|right|bottom|left|inset)-/,
  /^(border|ring|shadow)$/,
  /^border-[trbl]$/,
  /** Raio de um canto só — as cinco micromarcas do app; não é o raio da caixa. */
  /^rounded-(t|r|b|l|tl|tr|br|bl|s|e)(-|$)/,
  /** Transformação, não caixa: `translate-x-5` move o knob do `Toggle`, não o mede. */
  /^-?translate-[xy]-/,
];

/** Medidas que não são px e o spec não compara nesse eixo. */
const NON_PX = new Set(["full", "auto", "screen", "fit", "min", "max"]);

/** `2.5` → 10 · `px` → 1 · `[3px]` → 3. */
function spacing(raw: string): number {
  if (raw === "px") return 1;
  const arbitrary = /^\[([0-9.]+)px\]$/.exec(raw);
  if (arbitrary) return Number(arbitrary[1]);
  const step = Number(raw);
  if (Number.isNaN(step)) throw new Error(`passo de espaçamento não reconhecido: "${raw}"`);
  return step * SPACING;
}

export interface Geometry {
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: string;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  marginTop?: number | "auto";
  marginRight?: number | "auto";
  marginBottom?: number | "auto";
  marginLeft?: number | "auto";
  gap?: number;
  width?: number;
  height?: number;
  borderRadius?: number;
  display?: string;
  alignItems?: string;
  gridTemplateColumns?: string;
}

const SIDES: Record<string, readonly string[]> = {
  t: ["Top"],
  r: ["Right"],
  b: ["Bottom"],
  l: ["Left"],
  x: ["Left", "Right"],
  y: ["Top", "Bottom"],
};
const ALL_SIDES = ["Top", "Right", "Bottom", "Left"] as const;

/**
 * Resolve as classes de um elemento. Só o que o elemento declara entra no
 * resultado: **ausência é ausência, não zero** — o teste compara propriedade por
 * propriedade, e um zero inventado esconderia a diferença entre "não declara" e
 * "declara zero".
 */
export function geometryOf(className: string): Geometry {
  const out: Geometry = {};

  for (const token of className.split(/\s+/).filter(Boolean)) {
    // `text-sm!` — o `!` é ordem de cascata, não medida.
    const raw = token.replace(/!$/, "");

    if (raw === "grid" || raw === "flex" || raw === "inline-flex" || raw === "block") {
      out.display = raw;
      continue;
    }

    const align = /^items-(start|center|end|baseline|stretch)$/.exec(raw);
    if (align) {
      // O CSS chama "start"/"end" de `flex-start`/`flex-end`; o spec vem do CSS.
      out.alignItems = { start: "flex-start", end: "flex-end" }[align[1]] ?? align[1];
      continue;
    }

    const grid = /^grid-cols-\[(.+)\]$/.exec(raw);
    if (grid) {
      out.gridTemplateColumns = grid[1].replace(/_/g, " ");
      out.display = "grid";
      continue;
    }

    const size = /^text-(.+)$/.exec(raw);
    if (size && size[1] in TEXT_SIZES) {
      out.fontSize = TEXT_SIZES[size[1]];
      // O overline é o único degrau que carrega peso e tracking no próprio token.
      if (size[1] === "overline") {
        out.fontWeight = Number(cssRaw("--text-overline--font-weight"));
        out.letterSpacing = cssRaw("--text-overline--letter-spacing");
      }
      const lineHeight = cssRaw(`--text-${size[1]}--line-height`);
      if (lineHeight) out.lineHeight = Number(lineHeight);
      continue;
    }

    const weight = /^font-(normal|medium|semibold)$/.exec(raw);
    if (weight) {
      out.fontWeight = WEIGHTS[weight[1]];
      continue;
    }

    const pad = /^p([trblxy])?-(.+)$/.exec(raw);
    if (pad && !NON_PX.has(pad[2])) {
      const value = spacing(pad[2]);
      for (const side of pad[1] ? SIDES[pad[1]] : ALL_SIDES) {
        out[`padding${side}` as "paddingTop"] = value;
      }
      continue;
    }

    const margin = /^m([trblxy])?-(.+)$/.exec(raw);
    if (margin) {
      const value = margin[2] === "auto" ? ("auto" as const) : spacing(margin[2]);
      for (const side of margin[1] ? SIDES[margin[1]] : ALL_SIDES) {
        out[`margin${side}` as "marginTop"] = value;
      }
      continue;
    }

    const gap = /^gap-(.+)$/.exec(raw);
    if (gap) {
      out.gap = spacing(gap[1]);
      continue;
    }

    const box = /^(w|h|size)-(.+)$/.exec(raw);
    if (box) {
      if (NON_PX.has(box[2])) continue;
      const value = spacing(box[2]);
      if (box[1] !== "h") out.width = value;
      if (box[1] !== "w") out.height = value;
      continue;
    }

    const radius = /^rounded(?:-(.+))?$/.exec(raw);
    if (radius && !IGNORED.some((pattern) => pattern.test(raw))) {
      const name = radius[1] ?? "control";
      if (!(name in RADII)) throw new Error(`raio fora dos tokens do design: "${raw}"`);
      out.borderRadius = RADII[name];
      continue;
    }

    if (IGNORED.some((pattern) => pattern.test(raw))) continue;

    throw new Error(
      `classe não classificada no resolvedor de geometria: "${raw}". ` +
        `Se carrega medida, trate-a acima; se não carrega, some a IGNORED. ` +
        `Ignorar por omissão é como as travas antigas ficaram verdes sobre layout aproximado.`
    );
  }

  return out;
}

export { ROOT_FONT_SIZE, SPACING, TEXT_SIZES };
