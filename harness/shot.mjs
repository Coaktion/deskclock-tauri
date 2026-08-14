/**
 * Galeria da bancada — fotografa as composições de `harness/composicoes.tsx` em
 * Chromium, nos dois modos, sem comparar com nada.
 *
 * `visual-check.mjs` mede o componente **contra o wireframe**, e por isso todo
 * caso dele precisa de um nó equivalente no mock. Composição de tela não tem:
 * ela diverge do wireframe por decisão, e a divergência é o assunto. Aqui só se
 * olha.
 *
 * Mesma disciplina de determinismo do outro script: rede bloqueada e as duas
 * famílias embutidas do mesmo woff2 que a app empacota — senão a foto sai com a
 * fonte de sistema e mede outra coisa.
 *
 * Uso: `node harness/shot.mjs [id...]` (sem id, fotografa todas).
 */
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, ".visual");
const MODOS = ["escuro", "claro"];

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

const cssDeFontes = () =>
  FONTES.map(([family, file]) => {
    const b64 = readFileSync(resolve(ROOT, "node_modules", file)).toString("base64");
    return `@font-face{font-family:"${family}";font-style:normal;font-weight:400 600;font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2-variations")}`;
  }).join("\n");

mkdirSync(OUT, { recursive: true });

const server = await createServer({
  root: ROOT,
  server: { port: 5198, strictPort: true },
  logLevel: "warn",
  optimizeDeps: { entries: ["harness/main.tsx"] },
});
await server.listen();
const base = "http://localhost:5198";

const { COMPOSICOES } = await server.ssrLoadModule("/harness/composicoes.tsx");
const pedidos = process.argv.slice(2);
const alvos = pedidos.length ? COMPOSICOES.filter((p) => pedidos.includes(p.id)) : COMPOSICOES;

const browser = await chromium.launch();
const contexto = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 2,
});
await contexto.route("**/*", (route) => {
  const url = route.request().url();
  return url.startsWith(base) || url.startsWith("data:") ? route.continue() : route.abort();
});

const fontes = cssDeFontes();
const pagina = await contexto.newPage();
const medidas = [];

for (const composicao of alvos) {
  for (const modo of MODOS) {
    await pagina.goto(`${base}/harness/index.html?case=${composicao.id}`, { waitUntil: "load" });
    await pagina.addStyleTag({ content: fontes });
    await pagina.evaluate((m) => {
      document.documentElement.dataset.mode = m;
      document.documentElement.dataset.accent = "azul";
      return document.fonts.ready;
    }, modo);
    const arquivo = resolve(OUT, `${composicao.id}.${modo}.png`);
    await pagina.locator("[data-bancada-caso]").screenshot({ path: arquivo });
    if (modo === "escuro") {
      // Onde cada seção começa e quanto de lista cabe — é o que a composição
      // decide, e ler do DOM evita estimar por foto.
      medidas.push({
        id: composicao.id,
        nota: composicao.nota,
        secoes: await pagina.evaluate(() => {
          const corpo = document.querySelector("[data-bancada-caso]").firstElementChild;
          const topo = corpo.getBoundingClientRect().top;
          return Array.from(corpo.children).map((el) => {
            const r = el.getBoundingClientRect();
            const titulo = el.querySelector("p")?.textContent ?? el.tagName.toLowerCase();
            const linhas = el.querySelectorAll("[class*='grid-cols-']").length;
            return {
              titulo,
              y: +(r.top - topo).toFixed(2),
              altura: +r.height.toFixed(2),
              linhas,
            };
          });
        }),
      });
    }
  }
}

writeFileSync(resolve(OUT, "composicoes.json"), JSON.stringify(medidas, null, 2));

for (const m of medidas) {
  console.log(`\n${m.id} — ${m.nota}`);
  for (const s of m.secoes) {
    console.log(
      `  y=${String(s.y).padStart(6)}  h=${String(s.altura).padStart(6)}  ${s.titulo}` +
        (s.linhas ? `  (${s.linhas} linhas)` : "")
    );
  }
}
console.log(`\nPNG em ${OUT}`);

await browser.close();
await server.close();
