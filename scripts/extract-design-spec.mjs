/**
 * Extrai o spec geométrico dos wireframes do Claude Design para JSON.
 *
 * Existe porque as duas primeiras rodadas de fidelidade trabalharam a partir de
 * prosa — "cabeçalho de seção em overline" — e prosa não tem número. O que não
 * estava escrito em documento nenhum (fundo próprio do cabeçalho, régua
 * inferior, grid de colunas fixas) nunca entrou em plano nenhum, e o documento
 * da rodada chegou a afirmar que um componente divergente estava fiel.
 *
 * A entrada é o `.dc.html` exportado do projeto de design, versionado em
 * `raw/`: os wireframes são HTML com `style` inline em cada elemento, ou seja
 * já são o spec — só não estavam legíveis por máquina. A saída é uma árvore por
 * tela, com toda propriedade geométrica normalizada em px.
 *
 * Uso: `node scripts/extract-design-spec.mjs`
 *
 * Não usa parser de HTML de biblioteca de propósito: seria dependência nova
 * fora da lista homologada, e a entrada é gerada por máquina — sem tag
 * implícita, sem atributo sem aspas, sem os casos que justificariam um parser
 * de verdade. O tokenizador abaixo falha alto se essa premissa deixar de valer.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "docs-internal/design-spec/raw/telas-redesenhadas.html";
const OUT = "docs-internal/design-spec/telas-redesenhadas.json";

/** A raiz do documento de design é 16px, como a do app — daí `rem × 16`. */
const ROOT_FONT_SIZE = 16;

/**
 * Elementos vazios do HTML: não abrem nível na árvore. Só os do HTML — os
 * filhos de `<svg>` (`path`, `circle`) **não** entram aqui: o export os escreve
 * com tag de fechamento explícita, e tratá-los como vazios faria o `</path>`
 * fechar o `<svg>` e desmontar a árvore a partir dali.
 */
const VOID_TAGS = new Set(["br", "hr", "img", "input", "meta", "link", "source"]);

/** Conteúdo ignorado por não descrever geometria de tela. */
const OPAQUE_TAGS = new Set(["script", "style"]);

/**
 * Propriedades que o spec carrega. O resto do `style` inline (transition,
 * cursor, text-wrap) não é medida e ficaria como ruído no diff.
 *
 * `flex` entra porque é ele, e não `width`, que decide a coluna que estica; e
 * `grid-template-columns` porque o censo mostrou 17 usos em três formas — a
 * linha de tarefa é grid de colunas fixas no sistema inteiro.
 */
const TRACKED = [
  "display",
  "flex",
  "flex-direction",
  "flex-shrink",
  "grid-template-columns",
  "align-items",
  "justify-content",
  "gap",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-left",
  "width",
  "min-width",
  "max-width",
  "height",
  "min-height",
  "border",
  "border-top",
  "border-bottom",
  "border-left",
  "border-right",
  "border-radius",
  "background",
  "color",
  "font-family",
  "font-size",
  "font-weight",
  "line-height",
  "letter-spacing",
  "text-transform",
  "font-variant-numeric",
  "overflow",
  "overflow-y",
  "position",
  "top",
  "right",
  "bottom",
  "left",
];

/** `0.625rem` → 10 · `88px` → 88 · `72%` → "72%" · `1fr auto` → "1fr auto". */
function toPx(value) {
  const trimmed = value.trim();
  const rem = /^(-?[0-9.]+)rem$/.exec(trimmed);
  if (rem) return Number((Number(rem[1]) * ROOT_FONT_SIZE).toFixed(4));
  const px = /^(-?[0-9.]+)px$/.exec(trimmed);
  if (px) return Number(px[1]);
  return trimmed;
}

/**
 * Valor de atalho (`padding: 10px 12px`) virando lista de px, para o teste
 * poder comparar lado a lado sem reimplementar a expansão do shorthand.
 */
function normalizeValue(prop, value) {
  if (prop === "font-family" || prop === "grid-template-columns") return value.trim();
  const parts = value.trim().split(/\s+(?![^(]*\))/);
  const mapped = parts.map(toPx);
  return mapped.length === 1 ? mapped[0] : mapped;
}

function parseStyle(raw) {
  const out = {};
  for (const decl of raw.split(";")) {
    const at = decl.indexOf(":");
    if (at === -1) continue;
    const prop = decl.slice(0, at).trim();
    if (!TRACKED.includes(prop)) continue;
    out[prop] = normalizeValue(prop, decl.slice(at + 1));
  }
  return out;
}

function parseAttrs(raw) {
  const out = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) out[m[1]] = m[2];
  return out;
}

/**
 * Árvore de nós com `path` estável. O `path` é a cadeia de índices desde a
 * raiz da tela: é ele que o teste cita quando precisa de um nó que não tem
 * texto próprio para ancorar.
 */
function parse(html) {
  const root = { tag: "#root", path: "", style: {}, text: "", children: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][^\s>]*)\s*>|<([a-zA-Z][^\s/>]*)([^>]*?)(\/?)>|([^<]+)/g;
  let m;

  while ((m = re.exec(html))) {
    const [full, closeTag, openTag, attrsRaw, selfClose, text] = m;
    const top = stack[stack.length - 1];

    if (full.startsWith("<!--")) continue;

    if (text !== undefined) {
      const clean = text.replace(/\s+/g, " ").trim();
      if (clean && !OPAQUE_TAGS.has(top.tag)) top.text = top.text ? `${top.text} ${clean}` : clean;
      continue;
    }

    if (closeTag) {
      // Fechamento sem abertura correspondente: a premissa de "HTML gerado por
      // máquina" caiu, e seguir produziria uma árvore torta que o teste leria
      // como spec. Melhor falhar aqui.
      if (stack.length === 1) throw new Error(`</${closeTag}> sem abertura`);
      stack.pop();
      continue;
    }

    const tag = openTag.toLowerCase();
    const attrs = parseAttrs(attrsRaw);
    const node = {
      tag,
      path: `${top.path}${top.path ? "/" : ""}${top.children.length}`,
      style: parseStyle(attrs.style ?? ""),
      text: "",
      children: [],
    };
    if (attrs.id) node.id = attrs.id;
    if (attrs["data-lucide"]) node.icon = attrs["data-lucide"];
    top.children.push(node);

    if (!selfClose && !VOID_TAGS.has(tag)) stack.push(node);
  }

  return root;
}

/**
 * Poda o interior dos `<svg>`. São os traçados das marcas (Monday, Clockify) —
 * dezenas de `<path>` sem uma propriedade rastreada, que nenhum teste ancora e
 * que respondiam por metade do JSON. O `<svg>` em si fica, porque é dele que
 * sai a medida do ícone. Podar só aqui dentro mantém os índices de `path`
 * estáveis: nada fora do `<svg>` é renumerado.
 */
function pruneSvgInterior(node) {
  if (node.tag === "svg") node.children = [];
  else node.children.forEach(pruneSvgInterior);
  return node;
}

/** Nós de uma tela, achatados: o teste ancora por texto, não por caminho. */
function flatten(node, out = []) {
  out.push(node);
  for (const child of node.children) flatten(child, out);
  return out;
}

/**
 * Reescreve `path` relativo à tela. Sem isto o caminho carrega a posição do
 * bloco dentro do documento inteiro, e mexer na legenda de uma tela renumeraria
 * o spec das outras — um diff enorme para uma mudança que não é de interface.
 */
function reroot(node, prefix = "") {
  node.path = prefix;
  node.children.forEach((child, index) => reroot(child, `${prefix}${prefix ? "/" : ""}${index}`));
  return node;
}

function findScreens(root) {
  const screens = {};
  for (const node of flatten(root)) {
    if (!/^3[a-z]$/.test(node.id ?? "")) continue;
    // A tela é o segundo filho do bloco: o primeiro é a legenda do documento
    // ("3a · Tarefas · saudação vira subtítulo"), que não é interface.
    const frame = node.children[1];
    if (!frame) throw new Error(`bloco ${node.id} sem wireframe`);
    screens[node.id] = {
      label: node.children[0]?.children?.[1]?.text ?? "",
      frame: reroot(pruneSvgInterior(frame)),
    };
  }
  return screens;
}

const html = readFileSync(resolve(ROOT, SOURCE), "utf8");
const screens = findScreens(parse(html));
const ids = Object.keys(screens);
if (ids.length === 0) throw new Error("nenhuma tela encontrada — o export mudou de formato?");

const outPath = resolve(ROOT, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify({ source: SOURCE, rootFontSize: ROOT_FONT_SIZE, screens }, null, 2)}\n`
);

const total = ids.reduce((sum, id) => sum + flatten(screens[id].frame).length, 0);
console.log(`${OUT}: ${ids.length} telas (${ids.join(", ")}), ${total} nós`);
