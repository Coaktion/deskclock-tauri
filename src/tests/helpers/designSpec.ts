import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Acesso ao spec extraído dos wireframes do Claude Design
 * (`docs/design-spec/telas-redesenhadas.json`, gerado por
 * `scripts/extract-design-spec.mjs`).
 *
 * A ancoragem é **por texto**, não por caminho: `node("3a", "Daily do time de
 * produto")` continua achando a linha depois de o design ganhar uma seção acima
 * dela, e diz no próprio teste de que elemento se está falando. O `path` fica
 * disponível para o nó que não tem texto próprio — o trilho da barra do KPI, o
 * ponto de cor.
 */

const SPEC_PATH = resolve(__dirname, "../../..", "docs/design-spec/telas-redesenhadas.json");

export interface SpecNode {
  tag: string;
  path: string;
  text: string;
  icon?: string;
  style: Record<string, number | string | (number | string)[]>;
  children: SpecNode[];
}

interface Spec {
  source: string;
  rootFontSize: number;
  screens: Record<string, { label: string; frame: SpecNode }>;
}

const spec: Spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));

function descendants(node: SpecNode, parents: Map<SpecNode, SpecNode>): SpecNode[] {
  const out = [node];
  for (const child of node.children) {
    parents.set(child, node);
    out.push(...descendants(child, parents));
  }
  return out;
}

class Screen {
  private readonly parents = new Map<SpecNode, SpecNode>();
  private readonly all: SpecNode[];

  constructor(
    readonly id: string,
    readonly frame: SpecNode
  ) {
    this.all = descendants(frame, this.parents);
  }

  /**
   * Único nó cujo texto próprio é exatamente `text`. Exige unicidade: o mock
   * repete rótulos entre telas, e um `find` silencioso pegaria o primeiro e
   * afirmaria a medida do elemento errado.
   */
  byText(text: string): SpecNode {
    const found = this.all.filter((node) => node.text === text);
    if (found.length === 0) throw new Error(`${this.id}: nenhum nó com texto "${text}"`);
    if (found.length > 1) {
      throw new Error(
        `${this.id}: ${found.length} nós com texto "${text}" (${found
          .map((node) => node.path)
          .join(", ")}) — ancore por path`
      );
    }
    return found[0];
  }

  byPath(path: string): SpecNode {
    const found = this.all.find((node) => node.path === path);
    if (!found) throw new Error(`${this.id}: nenhum nó em "${path}"`);
    return found;
  }

  parentOf(node: SpecNode): SpecNode {
    const found = this.parents.get(node);
    if (!found) throw new Error(`${this.id}: "${node.path}" é a raiz da tela`);
    return found;
  }

  /** Sobe `levels` níveis — a linha que contém o nome, a seção que contém a linha. */
  ancestorOf(node: SpecNode, levels: number): SpecNode {
    let current = node;
    for (let i = 0; i < levels; i++) current = this.parentOf(current);
    return current;
  }
}

const cache = new Map<string, Screen>();

export function screen(id: string): Screen {
  const cached = cache.get(id);
  if (cached) return cached;

  const entry = spec.screens[id];
  if (!entry) {
    throw new Error(`tela "${id}" não está no spec (tem: ${Object.keys(spec.screens).join(", ")})`);
  }
  const built = new Screen(id, entry.frame);
  cache.set(id, built);
  return built;
}

/** Número declarado, com erro claro quando o nó não declara a propriedade. */
export function numberOf(node: SpecNode, prop: string): number {
  const value = node.style[prop];
  if (typeof value !== "number") {
    throw new Error(`spec ${node.path} não declara "${prop}" como número (${String(value)})`);
  }
  return value;
}

export function stringOf(node: SpecNode, prop: string): string {
  const value = node.style[prop];
  if (typeof value !== "string") {
    throw new Error(`spec ${node.path} não declara "${prop}" como texto (${String(value)})`);
  }
  return value;
}

/** `padding: 12` e `padding: [10, 12]` viram sempre os quatro lados. */
export function paddingOf(node: SpecNode): {
  top: number;
  right: number;
  bottom: number;
  left: number;
} {
  const raw = node.style.padding;
  const parts = (Array.isArray(raw) ? raw : [raw]).map((part) =>
    // `padding: 0 1.25rem` — o `0` sem unidade fica string na extração.
    typeof part === "number" ? part : Number(part)
  );
  if (parts.some(Number.isNaN)) throw new Error(`spec ${node.path}: padding não numérico`);
  const [a, b = a, c = a, d = b] = parts;
  return { top: a, right: b, bottom: c, left: d };
}

/**
 * O raio em px do Tailwind. O mock escreve o raio total como `99px` e o
 * Tailwind emite `9999px`: são a mesma intenção ("pílula"), e comparar os
 * números crus reprovaria um componente correto.
 */
export function radiusOf(node: SpecNode): number {
  const value = numberOf(node, "border-radius");
  return value >= 99 ? 9999 : value;
}

/** O nó declara fundo próprio? A casca do cartão de seção não declara. */
export function hasBackground(node: SpecNode): boolean {
  return node.style.background !== undefined;
}

export { spec };
