/**
 * Bancada visual — compara o componente **renderizado em Chromium** com o
 * wireframe do design, medida a medida e pixel a pixel.
 *
 * Por que existe, ao lado do `screenGeometry.test.tsx`: aquele teste resolve
 * classe do Tailwind para px e compara com o spec, o que cobre tudo que vem de
 * classe ou token — e **nada** do que só existe depois do layout. A altura real
 * da linha, a largura que a coluna do grid recebe, a quebra do nome longo, o
 * antialiasing do texto em 10,5px: nada disso o jsdom calcula. Aqui um browser
 * de verdade calcula, nas duas pontas.
 *
 * **Não entra no `pnpm test`, de propósito.** Diff de pixel depende de fonte, de
 * versão de browser e de GPU; num gate obrigatório ele viraria a falha que todo
 * mundo aprende a ignorar, e uma trava ignorada é pior que trava nenhuma. Aqui é
 * `pnpm visual`: roda quando se está mexendo em aparência, escreve relatório e
 * PNG em `.visual/`, e o julgamento é de quem olha.
 *
 * Determinismo: **a rede é bloqueada e as duas pontas usam o mesmo woff2 local.**
 * Sem isso o mock busca as fontes no Google, e a mesma execução dá números
 * diferentes com a conexão ruim — ou cai na fonte de sistema e mede outra coisa.
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".visual");
const MOCK = resolve(ROOT, "docs/design-spec/raw/telas-redesenhadas.html");
const SPEC = JSON.parse(readFileSync(resolve(ROOT, "docs/design-spec/telas-redesenhadas.json")));

/** Diferença de pixel acima disto vira falha declarada no relatório. */
const LIMITE_DIFF = 0.02;

/** As duas famílias empacotadas, embutidas para as duas pontas usarem o mesmo arquivo. */
const FONTES = [
  [
    "Source Sans 3",
    "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2",
  ],
  [
    "Source Code Pro",
    "@fontsource-variable/source-code-pro/files/source-code-pro-latin-wght-normal.woff2",
  ],
];

function cssDeFontes() {
  return FONTES.map(([family, file]) => {
    const b64 = readFileSync(resolve(ROOT, "node_modules", file)).toString("base64");
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:400 600;font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2-variations")}`;
  }).join("\n");
}

/**
 * Medida computada → propriedade que o **spec** precisa declarar para ela ser
 * afirmada.
 *
 * A comparação é só do que o design declara, e isso não é preguiça: o browser
 * computa **tudo**, então comparar a lista inteira compara herança. Três ruídos
 * concretos que essa regra elimina, e que apareceram na primeira execução:
 *
 * - `font-size` herdado — o wireframe do documento vive numa caixa de 14px e o
 *   app numa raiz de 16, então todo elemento que não declara tamanho divergia. É
 *   a decisão do PR 6.5, não uma regressão de componente.
 * - `font-family` — as duas pontas resolvem para Source Sans 3 e diferem só na
 *   lista de fallback. Daí a comparação ser só da primeira família.
 * - `display`/`align-items`/`gap` em filho de grid — o CSS **blocifica** filho de
 *   grid, então o `<span>` do chip computa `block` no mock e `inline-flex` na app
 *   sem que nenhum dos dois tenha errado.
 */
const MEDIDAS = {
  display: "display",
  gridTemplateColumns: "grid-template-columns",
  gap: "gap",
  paddingTop: "padding",
  paddingRight: "padding",
  paddingBottom: "padding",
  paddingLeft: "padding",
  borderTopLeftRadius: "border-radius",
  borderBottomWidth: "border-bottom",
  alignItems: "align-items",
  fontSize: "font-size",
  fontWeight: "font-weight",
  fontFamily: "font-family",
};

const NOMES_MEDIDA = Object.keys(MEDIDAS);

/** Nó do spec pelo caminho — é ele que diz quais medidas valem afirmar. */
function noDoSpec(screenId, path) {
  let no = SPEC.screens[screenId].frame;
  for (const i of path === "" ? [] : path.split("/").map(Number)) no = no.children[i];
  return no;
}

/**
 * Raio total: o mock escreve `99px` e o Tailwind emite `calc(infinity * 1px)`,
 * que o browser computa como `3.35544e+07px`. São a mesma intenção — é a mesma
 * normalização que o `radiusOf` do `screenGeometry` faz do outro lado.
 */
function pilula(valor) {
  return Number.parseFloat(valor) >= 99;
}

/** Só a primeira família importa: o resto é lista de fallback. */
function primeiraFamilia(v) {
  return v
    .split(",")[0]
    .trim()
    .replace(/^["']|["']$/g, "");
}

/** Roda no browser: acha o nó pelo caminho do spec e devolve caixa + computado. */
const LER_NO = ({ screenId, path, medidas }) => {
  const bloco = document.getElementById(screenId);
  if (!bloco) throw new Error(`sem bloco #${screenId}`);
  let no = bloco.children[1]; // [0] é a legenda do documento, [1] é o wireframe
  for (const i of path === "" ? [] : path.split("/").map(Number)) {
    no = no.children[i];
    if (!no) throw new Error(`caminho ${path} não resolve`);
  }
  document.querySelectorAll("[data-medindo]").forEach((el) => el.removeAttribute("data-medindo"));
  no.setAttribute("data-medindo", "1");
  const r = no.getBoundingClientRect();
  const cs = getComputedStyle(no);
  const computado = {};
  for (const m of medidas) computado[m] = cs[m];
  return {
    caixa: { x: r.x, y: r.y, w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
    computado,
    texto: no.textContent.replace(/\s+/g, " ").trim().slice(0, 40),
  };
};

const LER_CASO = (medidas) => {
  const no = document.querySelector("[data-bancada-caso]").firstElementChild;
  const r = no.getBoundingClientRect();
  const cs = getComputedStyle(no);
  const computado = {};
  for (const m of medidas) computado[m] = cs[m];
  return {
    caixa: { x: r.x, y: r.y, w: +r.width.toFixed(2), h: +r.height.toFixed(2) },
    computado,
    texto: no.textContent.replace(/\s+/g, " ").trim().slice(0, 40),
  };
};

function compararPixels(a, b, destino) {
  const A = PNG.sync.read(a);
  const B = PNG.sync.read(b);
  const w = Math.min(A.width, B.width);
  const h = Math.min(A.height, B.height);
  const recortar = (img) => {
    if (img.width === w && img.height === h) return img;
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(img, out, 0, 0, w, h, 0, 0);
    return out;
  };
  const a2 = recortar(A);
  const b2 = recortar(B);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(a2.data, b2.data, diff.data, w, h, { threshold: 0.2 });
  writeFileSync(destino, PNG.sync.write(diff));
  return {
    ratio: n / (w * h),
    pixels: n,
    recortado: A.width !== B.width || A.height !== B.height,
    tamanhos: { mock: [A.width, A.height], app: [B.width, B.height] },
  };
}

// ─── Execução ────────────────────────────────────────────────────────────────

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  server: { port: 5199, strictPort: true },
  logLevel: "warn",
  // Sem isto o Vite varre **todo** HTML da raiz procurando dependência — o
  // `index.html` do app (que puxa o runtime do Tauri) e o próprio mock de
  // 126KB. A bancada é a única entrada que interessa.
  optimizeDeps: { entries: ["harness/main.tsx"] },
});
await server.listen();
const base = "http://localhost:5199";

// Os casos vivem em TSX e é o Vite que os compila — o mesmo servidor que serve a
// bancada, para não haver duas instâncias disputando o cache de dependência.
const { CASES: casos } = await server.ssrLoadModule("/harness/cases.tsx");

const browser = await chromium.launch();
const contexto = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});

// Rede fora. As fontes entram embutidas; o servidor local continua acessível.
await contexto.route("**/*", (route) => {
  const url = route.request().url();
  if (url.startsWith(base) || url.startsWith("file://") || url.startsWith("data:")) {
    return route.continue();
  }
  return route.abort();
});

const fontes = cssDeFontes();
const paginaMock = await contexto.newPage();
await paginaMock.goto(pathToFileURL(MOCK).href, { waitUntil: "domcontentloaded" });
await paginaMock.addStyleTag({ content: fontes });
await paginaMock.evaluate(() => document.fonts.ready);

const paginaApp = await contexto.newPage();

const relatorio = [];

for (const caso of casos) {
  const noSpec = await paginaMock
    .evaluate(LER_NO, { screenId: caso.screen, path: caso.anchor, medidas: NOMES_MEDIDA })
    .catch((e) => ({ erro: String(e.message ?? e) }));
  if (noSpec.erro) {
    relatorio.push({ id: caso.id, erro: `mock: ${noSpec.erro}` });
    continue;
  }

  await paginaMock.locator("[data-medindo]").screenshot({
    path: resolve(OUT, `${caso.id}.mock.png`),
  });

  // A largura disponível é a **medida no mock**, não a do arquivo de casos: com
  // a largura chutada, `flex:1` e `truncate` resolvem para outra coisa e a
  // comparação de caixa renderizada não diz nada. (O KPI: chutei 231, é 225,5.)
  await paginaApp.goto(`${base}/harness/index.html?case=${caso.id}&w=${noSpec.caixa.w}`, {
    waitUntil: "load",
  });
  await paginaApp.addStyleTag({ content: fontes });
  await paginaApp.evaluate(() => document.fonts.ready);
  const noApp = await paginaApp.evaluate(LER_CASO, NOMES_MEDIDA);
  await paginaApp
    .locator("[data-bancada-caso] > *")
    .first()
    .screenshot({ path: resolve(OUT, `${caso.id}.app.png`) });

  const px = compararPixels(
    readFileSync(resolve(OUT, `${caso.id}.mock.png`)),
    readFileSync(resolve(OUT, `${caso.id}.app.png`)),
    resolve(OUT, `${caso.id}.diff.png`)
  );

  const divergencias = [];
  if (Math.abs(noSpec.caixa.h - noApp.caixa.h) > 0.5) {
    divergencias.push(`altura ${noApp.caixa.h} ≠ ${noSpec.caixa.h}`);
  }
  if (Math.abs(noSpec.caixa.w - noApp.caixa.w) > 0.5) {
    divergencias.push(`largura ${noApp.caixa.w} ≠ ${noSpec.caixa.w}`);
  }
  const declarado = noDoSpec(caso.screen, caso.anchor).style;
  for (const m of NOMES_MEDIDA) {
    // Ausente no spec = o design não fala dessa propriedade nesse elemento;
    // afirmar o valor computado seria afirmar herança.
    if (declarado[MEDIDAS[m]] === undefined) continue;
    let esperado = noSpec.computado[m];
    let atual = noApp.computado[m];
    if (m === "fontFamily") {
      esperado = primeiraFamilia(esperado);
      atual = primeiraFamilia(atual);
    }
    if (m === "borderTopLeftRadius" && pilula(esperado) && pilula(atual)) continue;
    if (esperado !== atual) divergencias.push(`${m}: "${atual}" ≠ "${esperado}"`);
  }

  relatorio.push({
    id: caso.id,
    anchor: `${caso.screen}:${caso.anchor}`,
    caixaMock: noSpec.caixa,
    caixaApp: noApp.caixa,
    pixels: px,
    divergencias,
  });
}

await browser.close();
await server.close();

writeFileSync(resolve(OUT, "relatorio.json"), `${JSON.stringify(relatorio, null, 2)}\n`);

// ─── Saída legível ───────────────────────────────────────────────────────────

let comProblema = 0;
for (const r of relatorio) {
  if (r.erro) {
    console.log(`\n✗ ${r.id}\n    ${r.erro}`);
    comProblema++;
    continue;
  }
  const pct = (r.pixels.ratio * 100).toFixed(2);
  const ruim = r.divergencias.length > 0 || r.pixels.ratio > LIMITE_DIFF;
  if (ruim) comProblema++;
  console.log(`\n${ruim ? "✗" : "✓"} ${r.id}  (${r.anchor})`);
  console.log(
    `    caixa  mock ${r.caixaMock.w}×${r.caixaMock.h}   app ${r.caixaApp.w}×${r.caixaApp.h}`
  );
  console.log(
    `    pixel  ${pct}% diferentes (${r.pixels.pixels})${r.pixels.recortado ? " — tamanhos diferentes, comparado no menor" : ""}`
  );
  for (const d of r.divergencias) console.log(`    ·      ${d}`);
}

console.log(
  `\n${relatorio.length - comProblema}/${relatorio.length} casos fiéis. PNG e relatorio.json em .visual/`
);
if (comProblema > 0) {
  console.log(
    "Divergência aqui é medida, não opinião: confira o .diff.png antes de mexer no componente."
  );
}
