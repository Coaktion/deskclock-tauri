/**
 * Gera os 24 tokens `--color-project-N` do `src/index.css`.
 *
 * Existe porque os valores são resultado de medida, não de gosto: sem o gerador
 * eles são 24 linhas de números que ninguém consegue auditar nem estender. Rode
 * `node scripts/generate-project-palette.mjs` e cole a saída no `@theme static`.
 *
 * O que ele resolve: escolher N cores dentro do sRGB maximizando a **menor**
 * distância OKLab entre qualquer par — é a menor distância que decide se duas
 * linhas da lista parecem o mesmo projeto, não a média.
 *
 * Duas restrições moldam o volume, e as duas vêm do app:
 *
 * 1. **Contraste ≥3:1 contra os dois canvas** (escuro e claro). É o que dispensa
 *    uma segunda tabela de cores no `[data-mode="claro"]`. O piso é 3,08 em vez
 *    de 3,0 para o arredondamento dos valores não derrubar nenhum abaixo de 3.
 * 2. **Chroma entre 0,07 e 0,17.** Abaixo de 0,07 a cor se confunde com o cinza
 *    de `--color-project-none`; acima de 0,17 sai do sRGB na maior parte do
 *    círculo. Deixar o chroma variar nessa faixa contraria a regra antiga de
 *    "mesma lightness e chroma, só o hue muda" — a reversão é deliberada, e o
 *    porquê está no comentário do token, com o número que a justifica.
 *
 * A ordem da saída é *farthest-point-first*: cada slot é o mais distante possível
 * de todos os anteriores. Isso importa porque os slots são consumidos por ordem
 * de criação do projeto, então um workspace com 4 projetos usa os 4 primeiros e
 * merece a maior separação disponível, não uma fatia arbitrária do conjunto.
 */

const SLOTS = 24;
const CONTRAST_FLOOR = 3.08;
const CHROMA_MIN = 0.07;
const CHROMA_MAX = 0.17;
const LIGHTNESS_RANGE = [0.44, 0.7];

/** Canvas dos dois modos, como declarados no `@theme` e no `[data-mode="claro"]`. */
const CANVAS_DARK = [0.13, 0.028, 262];
const CANVAS_LIGHT = [0.985, 0.002, 248];

/** OKLab → sRGB linear. Coeficientes da especificação do Oklab (Björn Ottosson). */
function oklabToLinearRgb(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);

/** Luminância relativa da WCAG — parte de RGB linear, que é o que temos. */
function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map((v) => Math.max(0, Math.min(1, v)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (y1, y2) => (Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05);

function lchToOklab(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  return [L, C * Math.cos(h), C * Math.sin(h)];
}

const luminanceOfLch = ([L, C, h]) => relativeLuminance(oklabToLinearRgb(...lchToOklab(L, C, h)));

const distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

function smallestPairDistance(points) {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = distance(points[i], points[j]);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Todo ponto OKLab que serve de cor de projeto nos dois modos. */
function buildCandidates() {
  const yDark = luminanceOfLch(CANVAS_DARK);
  const yLight = luminanceOfLch(CANVAS_LIGHT);
  const candidates = [];
  for (let L = LIGHTNESS_RANGE[0]; L <= LIGHTNESS_RANGE[1] + 1e-9; L += 0.004) {
    for (let a = -CHROMA_MAX; a <= CHROMA_MAX + 1e-9; a += 0.006) {
      for (let b = -CHROMA_MAX; b <= CHROMA_MAX + 1e-9; b += 0.006) {
        const chroma = Math.hypot(a, b);
        if (chroma < CHROMA_MIN || chroma > CHROMA_MAX) continue;
        const rgb = oklabToLinearRgb(L, a, b);
        if (!inGamut(rgb)) continue;
        const y = relativeLuminance(rgb);
        if (contrast(y, yDark) < CONTRAST_FLOOR) continue;
        if (contrast(y, yLight) < CONTRAST_FLOOR) continue;
        candidates.push([L, a, b]);
      }
    }
  }
  return candidates;
}

/**
 * Semente: o azul de hoje (`oklch(0.65 0.16 258)`) rebaixado para dentro do
 * volume. Amarrar o slot 1 ao azul familiar é a única continuidade que sobra da
 * paleta anterior — os outros 23 são livres.
 */
function pickSeed(candidates) {
  const target = lchToOklab(0.62, 0.16, 255);
  return candidates.reduce(
    (best, p) => (distance(p, target) < distance(best, target) ? p : best),
    candidates[0]
  );
}

/** Farthest-point sampling: cada novo ponto é o mais longe do conjunto atual. */
function farthestPointSample(candidates, seed, count) {
  const chosen = [seed];
  const nearest = candidates.map((p) => distance(p, seed));
  while (chosen.length < count) {
    let bestIndex = -1;
    let bestDistance = -1;
    for (let i = 0; i < candidates.length; i++) {
      if (nearest[i] > bestDistance) {
        bestDistance = nearest[i];
        bestIndex = i;
      }
    }
    chosen.push(candidates[bestIndex]);
    for (let i = 0; i < candidates.length; i++) {
      const d = distance(candidates[i], candidates[bestIndex]);
      if (d < nearest[i]) nearest[i] = d;
    }
  }
  return chosen;
}

/**
 * O sampling é guloso, então erra: cada ponto é ótimo quando entra e deixa de
 * ser quando os seguintes chegam. Aqui cada um é reposicionado enquanto isso
 * aumentar a menor distância global — foi o que levou o conjunto de 0,069 para
 * 0,095. A busca fica perto do L original para não desfazer o espalhamento.
 */
function refine(chosen, candidates) {
  let best = smallestPairDistance(chosen);
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < chosen.length; i++) {
      const original = chosen[i];
      let bestPoint = original;
      for (const candidate of candidates) {
        if (Math.abs(candidate[0] - original[0]) > 0.04) continue;
        chosen[i] = candidate;
        const score = smallestPairDistance(chosen);
        if (score > best + 1e-9) {
          best = score;
          bestPoint = candidate;
        }
      }
      chosen[i] = bestPoint;
      if (bestPoint !== original) moved = true;
    }
    if (!moved) break;
  }
  return best;
}

/** Reordena o conjunto final sem mudá-lo: o mais distante primeiro. */
function orderByFarthestFirst(points, seed) {
  const ordered = [
    points.reduce((best, p) => (distance(p, seed) < distance(best, seed) ? p : best), points[0]),
  ];
  while (ordered.length < points.length) {
    let best = null;
    for (const p of points) {
      if (ordered.includes(p)) continue;
      const nearest = Math.min(...ordered.map((o) => distance(p, o)));
      if (!best || nearest > best.nearest) best = { p, nearest };
    }
    ordered.push(best.p);
  }
  return ordered;
}

const HUE_NAMES = [
  [15, "vermelho"],
  [45, "laranja"],
  [75, "âmbar"],
  [105, "oliva"],
  [135, "verde"],
  [165, "esmeralda"],
  [195, "ciano"],
  [225, "azul-aço"],
  [255, "azul"],
  [285, "índigo"],
  [315, "violeta"],
  [345, "rosa"],
];

const hueDelta = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function describe({ L, C, h }) {
  const name = HUE_NAMES.reduce((best, entry) =>
    hueDelta(h, entry[0]) < hueDelta(h, best[0]) ? entry : best
  )[1];
  const marks = [];
  if (C < 0.1) marks.push("lavado");
  if (L < 0.52) marks.push("escuro");
  return [name, ...marks].join(" ");
}

function main() {
  const candidates = buildCandidates();
  const seed = pickSeed(candidates);
  const chosen = farthestPointSample(candidates, seed, SLOTS);
  const score = refine(chosen, candidates);
  const ordered = orderByFarthestFirst(chosen, seed);

  const yDark = luminanceOfLch(CANVAS_DARK);
  const yLight = luminanceOfLch(CANVAS_LIGHT);
  const rounded = ordered.map(([L, a, b]) => {
    const color = {
      L: Math.round(L * 1000) / 1000,
      C: Math.round(Math.hypot(a, b) * 1000) / 1000,
      h: Math.round((((Math.atan2(b, a) * 180) / Math.PI + 360) % 360) * 10) / 10,
    };
    const rgb = oklabToLinearRgb(...lchToOklab(color.L, color.C, color.h));
    const y = relativeLuminance(rgb);
    return { ...color, gamut: inGamut(rgb), dark: contrast(y, yDark), light: contrast(y, yLight) };
  });

  const finalScore = smallestPairDistance(rounded.map((c) => lchToOklab(c.L, c.C, c.h)));
  const prefix = [4, 8, 12, 24]
    .map(
      (n) =>
        `${n}→${smallestPairDistance(rounded.slice(0, n).map((c) => lchToOklab(c.L, c.C, c.h))).toFixed(3)}`
    )
    .join("  ");

  console.log(
    `/* ${SLOTS} cores · separação mínima ${finalScore.toFixed(4)} (antes de arredondar: ${score.toFixed(4)})`
  );
  console.log(` * separação com os primeiros N slots: ${prefix}`);
  console.log(
    ` * dentro do sRGB: ${rounded.every((c) => c.gamut)} · contraste mínimo: escuro ${Math.min(...rounded.map((c) => c.dark)).toFixed(2)}:1, claro ${Math.min(...rounded.map((c) => c.light)).toFixed(2)}:1 */`
  );
  rounded.forEach((c, i) => {
    console.log(`  --color-project-${i + 1}: oklch(${c.L} ${c.C} ${c.h}); /* ${describe(c)} */`);
  });
}

main();
