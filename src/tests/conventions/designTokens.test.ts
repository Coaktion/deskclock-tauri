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
  "--color-success",
  "--color-warning",
  ...Array.from({ length: 24 }, (_, i) => `--color-project-${i + 1}`),
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
  "--color-success",
  "--color-warning",
];

/**
 * A camada tipográfica.
 *
 * `--font-sans` carrega mais peso que os outros: o Preflight deriva dele o
 * `--default-font-family` aplicado no `html`, então derrubá-lo não apaga um
 * utilitário — devolve o app inteiro para a stack de sistema, que é o estado
 * de antes desta migração e não se anuncia como erro.
 *
 * O `--text-overline` e seus dois modificadores são o quinto degrau da escala:
 * sem eles, `text-overline` deixa de dimensionar e o rótulo de seção volta ao
 * tamanho herdado, sem nada quebrar.
 *
 * `--text-sm` e `--text-xs` **sobrescrevem** degraus que o Tailwind já define,
 * e é por isso que a ausência deles é invisível: sem a redeclaração o app volta
 * a 14/12px e continua renderizando — só deixa de bater com o design. Os dois
 * degraus novos (`body`, `metric`) falham do jeito oposto, sumindo de tamanho.
 */
const TYPOGRAPHY_TOKENS = [
  "--font-sans",
  "--font-mono",
  "--font-weight-normal",
  "--font-weight-medium",
  "--font-weight-semibold",
  "--text-overline",
  "--text-overline--font-weight",
  "--text-overline--letter-spacing",
  "--text-sm",
  "--text-sm--line-height",
  "--text-xs",
  "--text-xs--line-height",
  "--text-body",
  "--text-body--line-height",
  "--text-metric",
  "--text-metric--line-height",
  "--text-nav",
  "--text-nav--line-height",
  "--text-micro",
  "--text-micro--line-height",
  "--text-lead",
  "--text-lead--line-height",
];

/**
 * A exceção da rodada de fidelidade: aqui o valor **é** a afirmação.
 *
 * Estes quatro são os únicos tokens cujo valor o resto da suíte não pode
 * inferir de nada — reancorá-los nos px do design é o que corrige a proporção
 * interna dos componentes, e um `pnpm update` do Tailwind que devolva `--text-sm`
 * ao padrão de 14px não quebra build, teste nem tela: só desfaz a rodada
 * inteira, 14% de cada vez.
 */
const REANCHORED_SIZES: [token: string, rem: string, px: string][] = [
  ["--text-sm", "0.765625rem", "12,25px"],
  ["--text-xs", "0.65625rem", "10,5px"],
  ["--text-body", "0.875rem", "14px"],
  ["--text-metric", "1.0625rem", "17px"],
  // Os três degraus medidos no spec extraído: 9px aparece 56 vezes nos
  // wireframes e 11px outras 40, e nenhum dos dois existia aqui.
  ["--text-nav", "0.5625rem", "9px"],
  ["--text-micro", "0.6875rem", "11px"],
  ["--text-lead", "0.9375rem", "15px"],
];

/** Cada família tem duas faces: latin e latin-ext. */
const FONT_FACES = [
  ["Source Sans 3", "400 600"],
  ["Source Code Pro", "400 500"],
] as const;

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

  it("declara as duas famílias, os três pesos e a escala inteira", () => {
    const body = blockBody(css, "@theme static {");
    expect(declaredIn(body, TYPOGRAPHY_TOKENS)).toEqual(TYPOGRAPHY_TOKENS);
  });

  it.each(REANCHORED_SIZES)(
    "%s vale %s (%s do design), e não o padrão do Tailwind",
    (token, rem) => {
      const body = blockBody(css, "@theme static {");
      expect(body).toMatch(new RegExp(`^\\s*${token}:\\s*${rem.replace(".", "\\.")};`, "m"));
    }
  );

  it("não reancora a raiz nem o ritmo de espaçamento", () => {
    // A reancoragem é só dos tamanhos de fonte. Raiz e `--spacing` sustentam
    // raio, cabeçalho de 56px, toggle 40×20 e a escala de ícones, que o design
    // especifica em px e que já batem — mexer neles reabriria tudo isso.
    expect(css).toMatch(/^\s*font-size:\s*16px;/m);
    expect(blockBody(css, "@theme static {")).not.toMatch(/^\s*--spacing:/m);
  });

  // `@font-face` não aninha bloco, então aqui `[^}]*` não corta nada pela metade.
  const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? [];

  it("empacota as duas famílias em latin e latin-ext", () => {
    expect(faces).toHaveLength(FONT_FACES.length * 2);
  });

  it.each(FONT_FACES)("%s carrega do binário, sem rede e sem troca à vista", (family, weight) => {
    const own = faces.filter((face) => face.includes(`font-family: "${family}"`));
    expect(own).toHaveLength(2);

    for (const face of own) {
      // `block` em vez de `swap`: o arquivo está no bundle e carrega em
      // milissegundos, então o salto de fonte do `swap` seria puro custo — e
      // aconteceria nas cinco janelas do app.
      expect(face).toContain("font-display: block");
      // O intervalo é o teto da escala, não o da fonte (200–900). É ele que faz
      // um `font-bold` esquecido renderizar 600 em vez de reintroduzir o peso.
      expect(face).toContain(`font-weight: ${weight}`);
      // url() de pacote, resolvida pelo Vite no build: nenhuma requisição sai
      // em runtime, e o woff2 não fica versionado no repositório.
      expect(face).toMatch(/url\("@fontsource-variable\/[^"]+\.woff2"\)/);
      expect(face).toContain("unicode-range:");
    }
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

  it("não sobrou nada do tema legado", () => {
    // Os três `[data-theme]` remapeavam famílias inteiras do Tailwind
    // (`blue`→`green`, a rampa de `gray` invertida), e as `--tw-gray-*` eram as
    // cópias fixas de que o modo claro legado dependia. Enquanto existirem,
    // `bg-gray-800` continua "funcionando" numa tela nova — parecendo certo e
    // ignorando o modo e o acento, que é a regressão mais fácil de não notar.
    expect(css).not.toContain("[data-theme=");
    expect(css).not.toContain("--tw-gray-");
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

  it("devolve o cursor de mão ao que se clica", () => {
    // O Tailwind v4 tirou do Preflight o `button { cursor: pointer }` que o v3
    // emitia. Apagar esta regra não quebra build, teste nem tela — e **no WSLg a
    // seta e a mão são o mesmo desenho**, então quem desenvolve em Linux não vê
    // nada. Aparece só no Windows, uma release depois, que é exatamente como ela
    // atravessou a migração do design system inteira sem ser notada.
    const base = blockBody(css, "@layer base {");
    expect(base).toContain("cursor: pointer");
    for (const selector of [
      "button:not(:disabled)",
      "select:not(:disabled)",
      'input:where([type="checkbox"], [type="radio"]):not(:disabled)',
      'label:has(input:where([type="checkbox"], [type="radio"]):not(:disabled))',
    ]) {
      expect(base).toContain(selector);
    }
  });
});

/**
 * As cores de projeto são as únicas da paleta cujo **valor** precisa de trava, e
 * o motivo é histórico: os 6 tokens anteriores pediam `C 0.16` em hues que não
 * alcançam isso no sRGB — o ciano de `hue 200` pedia 44% acima do máximo — e o
 * navegador os dessaturava calado. O verde, o âmbar e o ciano renderizavam
 * lavados, três das seis cores diziam menos do que o CSS afirmava, e nada na
 * suíte reprovava. Prosa não pega isso; conta pega.
 *
 * Aqui o valor é a afirmação, como nos quatro degraus reancorados acima.
 */
describe("convenção: as cores de projeto são utilizáveis nos dois modos", () => {
  const css = readFileSync(CSS_PATH, "utf8");

  /** OKLab → sRGB linear, coeficientes da especificação do Oklab. */
  function oklchToLinearRgb(L: number, C: number, hDeg: number): [number, number, number] {
    const h = (hDeg * Math.PI) / 180;
    const a = C * Math.cos(h);
    const b = C * Math.sin(h);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
  }

  const luminance = (rgb: [number, number, number]) => {
    const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(1, v)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  const contrast = (y1: number, y2: number) =>
    (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

  /** Os dois canvas, como o `@theme` e o `[data-mode="claro"]` os declaram. */
  const CANVAS_DARK = luminance(oklchToLinearRgb(0.13, 0.028, 262));
  const CANVAS_LIGHT = luminance(oklchToLinearRgb(0.985, 0.002, 248));

  const slots = Array.from({ length: 24 }, (_, i) => i + 1).map((n) => {
    const match = css.match(
      new RegExp(`--color-project-${n}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`)
    );
    if (!match) throw new Error(`--color-project-${n} não está declarado como oklch(L C H)`);
    return { n, L: Number(match[1]), C: Number(match[2]), h: Number(match[3]) };
  });

  it.each(slots)("project-$n está dentro do sRGB", ({ L, C, h }) => {
    // Fora do gamut, o navegador reduz o chroma por conta e a cor declarada não
    // é a cor exibida — que foi como três das seis anteriores viraram lavadas.
    for (const canal of oklchToLinearRgb(L, C, h)) {
      expect(canal).toBeGreaterThanOrEqual(-0.0005);
      expect(canal).toBeLessThanOrEqual(1.0005);
    }
  });

  it.each(slots)("project-$n contrasta ≥3:1 com os dois canvas", ({ L, C, h }) => {
    // É esta propriedade que dispensa uma segunda tabela de cores de projeto no
    // `[data-mode="claro"]`. Derrubá-la não quebra nada visível no escuro, que é
    // onde o app é desenvolvido: o ponto só desaparece no modo claro.
    const y = luminance(oklchToLinearRgb(L, C, h));
    expect(contrast(y, CANVAS_DARK)).toBeGreaterThanOrEqual(3);
    expect(contrast(y, CANVAS_LIGHT)).toBeGreaterThanOrEqual(3);
  });

  it("nenhum par de cores fica perto o bastante para se confundir", () => {
    // O piso é a menor distância OKLab que o gerador entrega (0,0945) menos uma
    // folga de arredondamento. Não é estético: é a distância que decide se duas
    // linhas da lista parecem o mesmo projeto. Baixá-lo é decisão de design e
    // exige mexer aqui — que é o ponto de ele estar escrito.
    const PISO = 0.09;
    const pontos = slots.map(({ n, L, C, h }) => {
      const rad = (h * Math.PI) / 180;
      return { n, L, a: C * Math.cos(rad), b: C * Math.sin(rad) };
    });

    const proximos: string[] = [];
    for (let i = 0; i < pontos.length; i++) {
      for (let j = i + 1; j < pontos.length; j++) {
        const p = pontos[i];
        const q = pontos[j];
        const d = Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
        if (d < PISO) proximos.push(`project-${p.n}/project-${q.n} (${d.toFixed(4)})`);
      }
    }
    expect(proximos).toEqual([]);
  });

  it("o modo claro não redefine cor de projeto nenhuma", () => {
    // Uma tabela só, e é o piso de contraste acima que a sustenta. Redefinir
    // uma no modo claro sem redefinir as 24 reabriria a divergência entre
    // modos que este bloco existe para fechar.
    const body = blockBody(css, '[data-mode="claro"] {');
    expect(body).not.toContain("--color-project-");
  });
});
