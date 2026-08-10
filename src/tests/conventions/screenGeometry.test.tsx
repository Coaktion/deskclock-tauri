import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { Badge } from "@presentation/components/ui/Badge";
import { KpiCard } from "@presentation/components/ui/KpiCard";
import { PageHeader } from "@presentation/components/ui/PageHeader";
import { SectionCard } from "@presentation/components/ui/SectionCard";
import { TaskRow } from "@presentation/components/ui/TaskRow";

import {
  hasBackground,
  numberOf,
  paddingOf,
  radiusOf,
  screen,
  stringOf,
  type SpecNode,
} from "../helpers/designSpec";
import { geometryOf } from "../helpers/tailwindGeometry";

/**
 * A geometria dos componentes contra o spec extraído dos wireframes
 * (`docs/design-spec/`, gerado por `scripts/extract-design-spec.mjs`).
 *
 * É a trava que faltava nas duas primeiras rodadas de fidelidade. As cinco
 * travas anteriores medem **token e uso de primitivo**: reprovam cor crua,
 * `text-[13px]`, `font-bold`, `<button>` com caixa própria. Nenhuma delas
 * reprova `gap-2` onde o design pede 10px, chip à esquerda em vez de à direita,
 * ou cabeçalho de seção sem fundo próprio — e foi por isso que o layout
 * aproximado passou verde duas vezes.
 *
 * Duas regras de método, e elas são o ponto:
 *
 * 1. **O número vem sempre do JSON**, nunca digitado aqui. Um valor teclado à
 *    mão é prosa outra vez, e a prosa é o que produziu a afirmação falsa de que
 *    o `SectionCard` estava fiel.
 * 2. **A assertiva é escrita antes da correção.** Um teste escrito depois só
 *    congela o que já está — foi assim que as cinco travas anteriores nasceram
 *    verdes sobre um layout aproximado.
 *
 * ## `divergente` — a catraca
 *
 * A regra 2 pede um teste que reprova hoje, mas commitar 15 falhas soltas
 * deixaria o CI vermelho por cinco sessões e, com ele vermelho, ninguém
 * distingue a divergência conhecida da regressão nova. Então cada divergência
 * medida entra como `divergente(...)`, que é `it.fails`: **passa enquanto a
 * assertiva reprova**.
 *
 * O efeito é uma catraca que falha nos dois sentidos, como o
 * `meaningColors.test.ts` já faz com a lista dele. Quando a etapa corrige o
 * componente, a assertiva passa, o `it.fails` reprova, e a única saída é trocar
 * `divergente` por `it` — ou seja, **corrigir sem declarar é impossível, e
 * declarar sem corrigir também**. `divergente` que sobra é dívida visível; zero
 * `divergente` é a tela fiel.
 *
 * **Cobertura declarada, e o que falta:** aqui estão os componentes que
 * renderizam sem provider, mais a composição do corpo da `TasksPage`, que é
 * lida do código-fonte (ver o bloco dela). `Sidebar` e `Omnibox` dependem de
 * contexto e entram nas etapas que já os tocam — F4 e F5. Enquanto não
 * entrarem, **eles não estão cobertos**, e dizer isso aqui é o que impede a
 * lista de parecer completa.
 */

const s3a = screen("3a");

/** O corpo rolável da tela — é dele que saem os degraus entre as seções. */
const BODY_PATH = "1/1/1";

/** Ancoragem por caminho onde o texto se repete entre linhas e telas. */
const SPEC = {
  pageHeader: s3a.byPath("1/1/0"),
  body: s3a.byPath(BODY_PATH),
  tourButton: s3a.byPath("1/1/0/2/0"),
  kpiCard: s3a.byPath("1/1/1/1/0"),
  kpiLabel: s3a.byText("Billable hoje"),
  kpiValue: s3a.byText("04:12:38"),
  kpiTrack: s3a.byPath("1/1/1/1/0/2"),
  kpiHint: s3a.byPath("1/1/1/1/0/3"),
  sectionCard: s3a.byPath("1/1/1/2"),
  sectionHeader: s3a.byPath("1/1/1/2/0"),
  sectionTitle: s3a.byText("Planejadas para hoje"),
  sectionCount: s3a.byPath("1/1/1/2/0/1"),
  sectionAction: s3a.byText("Ver semana →"),
  plannedRow: s3a.byPath("1/1/1/2/1"),
  plannedDot: s3a.byPath("1/1/1/2/1/0"),
  plannedTitle: s3a.byPath("1/1/1/2/1/1/0"),
  plannedSubtitle: s3a.byPath("1/1/1/2/1/1/1"),
  rowChip: s3a.byPath("1/1/1/2/1/2"),
  entriesRow: s3a.byPath("1/1/1/3/1"),
  entriesDuration: s3a.byText("02:48:00"),
  entriesActions: s3a.byPath("1/1/1/3/2/4"),
};

/** Primeiro elemento renderizado — a casca do componente. */
function shellOf(element: ReactElement): HTMLElement {
  const { container } = render(element);
  const shell = container.firstElementChild;
  if (!(shell instanceof HTMLElement)) throw new Error("componente não renderizou elemento");
  return shell;
}

/**
 * Divergência medida e ainda não corrigida: passa **enquanto** a assertiva
 * reprova. A etapa que corrige o componente troca `divergente` por `it` — ver o
 * bloco "catraca" no topo do arquivo.
 */
const divergente = it.fails;

/**
 * Padding é a única propriedade onde ausência **é** zero: o valor inicial do CSS
 * é 0, então `px-5` sem `py` produz o mesmo que o `padding: 0 1.25rem` do spec.
 * Nas outras a ausência continua sendo ausência — um `gap` não declarado não é
 * "gap zero", é um layout que não usa gap.
 */
function expectPadding(target: Element | string, node: SpecNode) {
  const actual = geometryOf(typeof target === "string" ? target : target.className);
  expect({
    top: actual.paddingTop ?? 0,
    right: actual.paddingRight ?? 0,
    bottom: actual.paddingBottom ?? 0,
    left: actual.paddingLeft ?? 0,
  }).toEqual(paddingOf(node));
}

/**
 * Fundo, régua e recorte são presença de classe, não medida — mas a afirmação
 * continua saindo do spec: o cartão de seção **não** declara `background`, e é
 * essa ausência que faz as linhas ficarem sobre o fundo da página.
 */
function expectBackground(el: Element, node: SpecNode) {
  const paints = /(?:^|\s)bg-[a-z]/.test(el.className);
  expect(paints, hasBackground(node) ? "spec pinta fundo" : "spec não pinta fundo").toBe(
    hasBackground(node)
  );
}

function expectBottomRule(el: Element, node: SpecNode) {
  const declares = node.style["border-bottom"] !== undefined;
  expect(/(?:^|\s)border-b(?:\s|$)/.test(el.className), "régua inferior").toBe(declares);
}

describe("geometria: tela 3a contra o spec do design", () => {
  describe("PageHeader", () => {
    const header = shellOf(<PageHeader title="Tarefas" onStartTour={() => {}} />);

    it("tem a altura e o gap do cabeçalho", () => {
      const actual = geometryOf(header.className);
      expect(actual.height).toBe(numberOf(SPEC.pageHeader, "height"));
      expect(actual.gap).toBe(numberOf(SPEC.pageHeader, "gap"));
    });

    it("tem o padding horizontal do cabeçalho", () => {
      expectPadding(header, SPEC.pageHeader);
    });

    divergente("o botão de tour é o círculo de 22px com glifo de 11px — divergente, F5", () => {
      const button = header.querySelector("button");
      expect(button).not.toBeNull();
      const actual = geometryOf(button!.className);
      expect(actual.width).toBe(numberOf(SPEC.tourButton, "width"));
      expect(actual.height).toBe(numberOf(SPEC.tourButton, "height"));
      expect(actual.fontSize).toBe(numberOf(SPEC.tourButton, "font-size"));
    });
  });

  describe("KpiCard", () => {
    const card = shellOf(
      <KpiCard
        label="Billable hoje"
        value="04:12:38"
        hint="72% do total"
        tone="billable"
        barPct={72}
      />
    );
    const [label, value, track, hint] = Array.from(card.children);

    it("tem o padding, o gap e o raio do cartão", () => {
      const actual = geometryOf(card.className);
      expectPadding(card, SPEC.kpiCard);
      expect(actual.gap).toBe(numberOf(SPEC.kpiCard, "gap"));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.kpiCard));
    });

    it("o rótulo é o overline de 10px", () => {
      const actual = geometryOf(label.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.kpiLabel, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.kpiLabel.style["font-weight"]));
      expect(actual.letterSpacing).toBe(SPEC.kpiLabel.style["letter-spacing"]);
    });

    it("o valor é o degrau de 17px em peso 500", () => {
      const actual = geometryOf(value.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.kpiValue, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.kpiValue.style["font-weight"]));
    });

    it("o trilho tem 3px e o offset do spec", () => {
      const actual = geometryOf(track.className);
      expect(actual.height).toBe(numberOf(SPEC.kpiTrack, "height"));
      expect(actual.marginTop).toBe(numberOf(SPEC.kpiTrack, "margin-top"));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.kpiTrack));
    });

    it("a dica é o caption de 10,5px", () => {
      const actual = geometryOf(hint.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.kpiHint, "font-size"));
      expect(actual.marginTop).toBe(numberOf(SPEC.kpiHint, "margin-top"));
    });
  });

  describe("SectionCard", () => {
    const card = shellOf(
      <SectionCard title="Planejadas para hoje" count={3} action={<span>Ver semana →</span>}>
        <div />
      </SectionCard>
    );
    const header = card.children[0];
    const [, count, action] = Array.from(header.children);

    it("a casca não pinta fundo, as linhas ficam sobre o canvas", () => {
      expectBackground(card, SPEC.sectionCard);
    });

    it("a casca recorta o conteúdo no raio", () => {
      // `overflow:hidden` no spec: é ele que faz a régua da última linha e o
      // fundo do cabeçalho respeitarem o canto arredondado.
      expect(SPEC.sectionCard.style.overflow).toBe("hidden");
      expect(card.className).toMatch(/(?:^|\s)overflow-hidden(?:\s|$)/);
    });

    it("o cabeçalho pinta fundo próprio e fecha com régua", () => {
      expectBackground(header, SPEC.sectionHeader);
      expectBottomRule(header, SPEC.sectionHeader);
    });

    it("o cabeçalho tem o padding, o gap e o alinhamento do spec", () => {
      expectPadding(header, SPEC.sectionHeader);
      const actual = geometryOf(header.className);
      expect(actual.gap).toBe(numberOf(SPEC.sectionHeader, "gap"));
      expect(actual.alignItems).toBe(SPEC.sectionHeader.style["align-items"]);
    });

    it("o título é o overline de 10px", () => {
      const title = header.querySelector("p");
      expect(title).not.toBeNull();
      expect(geometryOf(title!.className).fontSize).toBe(numberOf(SPEC.sectionTitle, "font-size"));
    });

    it("o contador é pílula própria, não texto concatenado no título", () => {
      const actual = geometryOf(count.className);
      expect(count.textContent).toBe("3");
      expect(actual.fontSize).toBe(numberOf(SPEC.sectionCount, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.sectionCount.style["font-weight"]));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.sectionCount));
      expectPadding(count, SPEC.sectionCount);
    });

    it("o slot de ação é o degrau de 11px, encostado à direita", () => {
      const actual = geometryOf(action.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.sectionAction, "font-size"));
      expect(actual.marginLeft).toBe(SPEC.sectionAction.style["margin-left"]);
    });
  });

  describe("TaskRow", () => {
    const row = shellOf(
      <TaskRow
        title="Daily do time de produto"
        subtitle="Coaktion · Reunião"
        duration="02:48:00"
        billable
        dotColor="oklch(0.65 0.16 300)"
        actions={<button />}
      />
    );

    it("é grid com as colunas do spec, não flex", () => {
      const actual = geometryOf(row.className);
      expect(actual.display).toBe(stringOf(SPEC.plannedRow, "display"));
      expect(actual.gridTemplateColumns).toBe(
        stringOf(SPEC.plannedRow, "grid-template-columns").replace(/\s+/g, " ")
      );
    });

    it("tem o gap e o padding da linha", () => {
      expect(geometryOf(row.className).gap).toBe(numberOf(SPEC.plannedRow, "gap"));
      expectPadding(row, SPEC.plannedRow);
    });

    it("fecha com régua em vez de flutuar como pílula arredondada", () => {
      expectBottomRule(row, SPEC.plannedRow);
      expect(geometryOf(row.className).borderRadius).toBeUndefined();
    });

    it("o ponto de projeto tem 6px", () => {
      const dot = row.querySelector("span[aria-hidden]");
      expect(dot).not.toBeNull();
      const actual = geometryOf(dot!.className);
      expect(actual.width).toBe(numberOf(SPEC.plannedDot, "width"));
      expect(actual.height).toBe(numberOf(SPEC.plannedDot, "height"));
    });

    it("o nome e o metadado ficam nos dois degraus do spec", () => {
      const [title, subtitle] = Array.from(row.querySelectorAll("p"));
      expect(geometryOf(title.className).fontSize).toBe(numberOf(SPEC.plannedTitle, "font-size"));
      const meta = geometryOf(subtitle.className);
      expect(meta.fontSize).toBe(numberOf(SPEC.plannedSubtitle, "font-size"));
      expect(meta.marginTop).toBe(numberOf(SPEC.plannedSubtitle, "margin-top"));
    });

    it("a duração fica no degrau de 12,25px, não no caption", () => {
      const duration = Array.from(row.querySelectorAll("span")).find(
        (el) => el.textContent === "02:48:00"
      );
      expect(duration).toBeDefined();
      expect(geometryOf(duration!.className).fontSize).toBe(
        numberOf(SPEC.entriesDuration, "font-size")
      );
    });

    it("as ações ficam no gap de 2px do spec", () => {
      const group = row.querySelector("button")?.parentElement;
      expect(group).not.toBeNull();
      expect(geometryOf(group!.className).gap).toBe(numberOf(SPEC.entriesActions, "gap"));
    });

    it("com chevron e faixa de horário, é a forma de cinco colunas", () => {
      // A segunda das três formas do censo (§7.2): o que muda entre elas é o
      // que **precede** o nome, e é isso que a linha lê das próprias props.
      const entry = shellOf(
        <TaskRow
          leading={<span aria-hidden />}
          meta={<span>13:30–13:48</span>}
          title="Daily do time de produto"
          subtitle="Coaktion · Reunião"
          duration="02:48:00"
          billable
          dotColor="oklch(0.65 0.16 300)"
        />
      );
      expect(geometryOf(entry.className).gridTemplateColumns).toBe(
        stringOf(SPEC.entriesRow, "grid-template-columns").replace(/\s+/g, " ")
      );
    });
  });

  /**
   * A composição do corpo — o degrau entre as seções e a ordem delas — é lida
   * do **código-fonte** da página, e não de um render.
   *
   * A `TasksPage` monta contexto, banco e IPC do Tauri; renderizá-la aqui
   * pediria uma dúzia de mocks, e cada hook novo na página quebraria a trava
   * com um erro que não fala de geometria nenhuma. O que esta fatia afirma
   * (gap, padding e ordem) está inteiro na classe do corpo e na ordem das tags,
   * que é o que o arquivo já mostra. O número continua vindo do JSON.
   */
  describe("TasksPage — a composição do corpo", () => {
    const source = readFileSync(
      resolve(__dirname, "../../..", "src/presentation/pages/TasksPage.tsx"),
      "utf8"
    );

    /** O corpo é o elemento que rola; é o que o identifica sem repetir a classe. */
    const body = /className="([^"]*overflow-y-auto[^"]*)"/.exec(source)?.[1];

    /** Em que filho do corpo o nó do spec cai — 0 é o primeiro. */
    function bodyIndex(node: SpecNode): number {
      if (!node.path.startsWith(`${BODY_PATH}/`)) {
        throw new Error(`spec ${node.path} não está dentro do corpo (${BODY_PATH})`);
      }
      return Number(node.path.slice(BODY_PATH.length + 1).split("/")[0]);
    }

    /** Cada seção da página pelo texto que ela escreve no mock. */
    const sections = {
      Omnibox: s3a.byText("Em que você está trabalhando?"),
      TotalsSection: s3a.byText("Billable hoje"),
      PlannedTasksSection: s3a.byText("Planejadas para hoje"),
      TodayEntriesSection: s3a.byText("Entradas de hoje"),
    };

    it("o corpo tem o padding e o degrau entre seções do spec", () => {
      expect(body, "corpo rolável não encontrado na TasksPage").toBeDefined();
      expectPadding(body!, SPEC.body);
      expect(geometryOf(body!).gap).toBe(numberOf(SPEC.body, "gap"));
    });

    it("as seções entram na ordem do design", () => {
      const design = Object.entries(sections)
        .sort(([, a], [, b]) => bodyIndex(a) - bodyIndex(b))
        .map(([name]) => name);

      const page = Object.keys(sections).map((name) => {
        const at = source.indexOf(`<${name}`);
        expect(at, `<${name}> não está na TasksPage`).toBeGreaterThan(-1);
        return [name, at] as const;
      });

      expect(page.sort((a, b) => a[1] - b[1]).map(([name]) => name)).toEqual(design);
    });
  });

  describe("Badge", () => {
    const chip = shellOf(<Badge tone="billable">Billable</Badge>);

    divergente("é pílula, não retângulo de raio 6 — divergente, F4", () => {
      expect(geometryOf(chip.className).borderRadius).toBe(radiusOf(SPEC.rowChip));
    });

    divergente("tem o tamanho, o peso e o padding do chip de linha — divergente, F4", () => {
      const actual = geometryOf(chip.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.rowChip, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.rowChip.style["font-weight"]));
      expectPadding(chip, SPEC.rowChip);
    });
  });
});
