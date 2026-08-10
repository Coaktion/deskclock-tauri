import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { OmniboxIdle } from "@presentation/components/OmniboxIdle";
import { Sidebar } from "@presentation/components/Sidebar";
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
 * ## `divergente` — a catraca, e por que ela não aparece aqui
 *
 * A regra 2 pede um teste que reprova hoje, mas commitar 15 falhas soltas
 * deixaria o CI vermelho por cinco sessões e, com ele vermelho, ninguém
 * distingue a divergência conhecida da regressão nova. Cada divergência medida
 * entrava então como `divergente(...)`, que é `it.fails`: passa **enquanto** a
 * assertiva reprova. Corrigir o componente faz o `it.fails` reprovar, e a única
 * saída é trocar `divergente` por `it` — corrigir sem declarar é impossível, e
 * declarar sem corrigir também.
 *
 * **A tela 3a está em zero**, e é por isso que o utilitário não existe mais no
 * arquivo: as 15 divergências que a F0 mediu foram fechadas entre a F1 e a F5.
 * Ele volta com a F6, que estende a trava às outras 6 telas — e volta com a
 * mesma regra, não como licença para deixar assertiva vermelha em paz.
 *
 * **Cobertura declarada, e o que falta:** aqui estão os componentes que
 * renderizam sem provider — mais o `OmniboxIdle` e a `Sidebar`, que pedem um
 * mock cada (ver os blocos deles) — e a composição do corpo da `TasksPage`, que
 * é lida do código-fonte. As outras 6 telas **não estão cobertas**, e dizer isso
 * aqui é o que impede a lista de parecer completa.
 */

/**
 * O único provider que o omnibox pede: o mapa projeto↔categoria abre o banco e
 * escuta evento do Tauri. Mockar o hook inteiro é uma linha; montar o
 * `RepositoriesContext` seria montar o app para medir um padding.
 */
vi.mock("@presentation/hooks/useProjectCategoryMap", () => ({
  useProjectCategoryMap: () => ({ categoriesFor: () => [] }),
}));

/**
 * A `Sidebar` só depende de contexto por causa do `WorkspaceSwitcher`, que puxa
 * três (workspaces, tarefa em execução, guarda de troca). Mockar o componente é
 * mais honesto que montar os três: o mock do design **não desenha o seletor** —
 * ele é exceção declarada (§7.5.6) —, então o que a trava mede é a nav sem ele,
 * que é exatamente o nó do spec.
 */
vi.mock("@presentation/components/WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: () => null,
}));

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
  kpiHintNumber: s3a.byPath("1/1/1/1/0/3/0"),
  sidebar: s3a.byPath("1/0"),
  sidebarItems: s3a.byPath("1/0/0"),
  sidebarItem: s3a.byPath("1/0/0/0"),
  sidebarActiveBar: s3a.byPath("1/0/0/0/0"),
  // Por caminho, não por texto: "Tarefas" é também o título da página.
  sidebarLabel: s3a.byPath("1/0/0/0/2"),
  sidebarFeedback: s3a.byPath("1/0/1"),
  sidebarFeedbackLabel: s3a.byText("Feedback"),
  omnibox: s3a.byPath("1/1/1/0"),
  omniboxRow: s3a.byPath("1/1/1/0/0"),
  omniboxPlay: s3a.byPath("1/1/1/0/0/0"),
  omniboxPlaceholder: s3a.byText("Em que você está trabalhando?"),
  omniboxChips: s3a.byPath("1/1/1/0/1"),
  omniboxChip: s3a.byPath("1/1/1/0/1/0"),
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
  /**
   * A moldura da esquerda — a única peça que aparece nas 7 telas e cujo rótulo
   * tem degrau próprio (9px): em `body/ui` ele cortava "Integra…" numa coluna
   * de 68px.
   */
  describe("Sidebar", () => {
    const nav = shellOf(<Sidebar current="tasks" onChange={() => {}} />);
    const [items, feedback] = Array.from(nav.children);
    const active = items.children[0];

    it("tem a largura e o padding da coluna", () => {
      expect(geometryOf(nav.className).width).toBe(numberOf(SPEC.sidebar, "width"));
      expectPadding(nav, SPEC.sidebar);
    });

    it("a pilha de itens tem o gap e o padding do spec", () => {
      expect(geometryOf(items.className).gap).toBe(numberOf(SPEC.sidebarItems, "gap"));
      expectPadding(items, SPEC.sidebarItems);
    });

    it("o item tem o gap ícone↔rótulo, o padding e o raio do spec", () => {
      const actual = geometryOf(active.className);
      expect(actual.gap).toBe(numberOf(SPEC.sidebarItem, "gap"));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.sidebarItem));
      expectPadding(active, SPEC.sidebarItem);
    });

    it("a barra do item ativo tem os 2px do spec", () => {
      const bar = active.children[0];
      expect(geometryOf(bar.className).width).toBe(numberOf(SPEC.sidebarActiveBar, "width"));
    });

    it("o rótulo é o degrau de 9px em peso 500, sem entrelinha sobrando", () => {
      const actual = geometryOf(active.lastElementChild!.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.sidebarLabel, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.sidebarLabel.style["font-weight"]));
      expect(actual.lineHeight).toBe(Number(SPEC.sidebarLabel.style["line-height"]));
    });

    it("o botão de feedback tem a largura, o gap e o padding do spec", () => {
      const actual = geometryOf(feedback.className);
      expect(actual.width).toBe(numberOf(SPEC.sidebarFeedback, "width"));
      expect(actual.gap).toBe(numberOf(SPEC.sidebarFeedback, "gap"));
      expectPadding(feedback, SPEC.sidebarFeedback);
      expect(geometryOf(feedback.lastElementChild!.className).fontSize).toBe(
        numberOf(SPEC.sidebarFeedbackLabel, "font-size")
      );
    });
  });

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

    it("o botão de tour é o círculo de 22px com glifo de 11px", () => {
      const button = header.querySelector("button");
      expect(button).not.toBeNull();
      const actual = geometryOf(button!.className);
      expect(actual.width).toBe(numberOf(SPEC.tourButton, "width"));
      expect(actual.height).toBe(numberOf(SPEC.tourButton, "height"));
      expect(actual.fontSize).toBe(numberOf(SPEC.tourButton, "font-size"));
    });
  });

  /**
   * O omnibox em repouso — a peça que abre a tela. O rascunho é fixture porque
   * o que se mede aqui é a caixa, não o comportamento: `useOmniboxDraft` tem
   * teste próprio, e um estado de verdade só traria o banco junto.
   */
  describe("OmniboxIdle", () => {
    const draft = {
      name: "",
      projectName: "",
      projectId: null,
      categoryName: "",
      categoryId: null,
      billable: true,
      plannedTaskId: null,
      customValues: {},
    };
    const box = shellOf(
      <OmniboxIdle
        projects={[]}
        categories={[]}
        containerRef={createRef<HTMLDivElement>()}
        draft={draft}
        setDraft={() => {}}
        focused={false}
        setFocused={() => {}}
        showSuggestions={false}
        setShowSuggestions={() => {}}
        activeSuggIdx={0}
        setActiveSuggIdx={() => {}}
        editingChip={null}
        setEditingChip={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        suggestions={[]}
        handleStart={() => Promise.resolve()}
        handleSuggestionSelect={() => {}}
        handleInputKeyDown={() => {}}
        reset={() => {}}
      />
    );
    const [mainRow, chipsRow] = Array.from(box.children);

    it("a casca é o cartão de raio 12 com fundo próprio", () => {
      expect(geometryOf(box.className).borderRadius).toBe(radiusOf(SPEC.omnibox));
      expectBackground(box, SPEC.omnibox);
    });

    it("a linha do campo tem o padding e o gap do spec", () => {
      expectPadding(mainRow, SPEC.omniboxRow);
      expect(geometryOf(mainRow.className).gap).toBe(numberOf(SPEC.omniboxRow, "gap"));
    });

    it("o botão de iniciar é o círculo de 40px", () => {
      const actual = geometryOf(mainRow.querySelector("button")!.className);
      expect(actual.width).toBe(numberOf(SPEC.omniboxPlay, "width"));
      expect(actual.height).toBe(numberOf(SPEC.omniboxPlay, "height"));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.omniboxPlay));
    });

    it("o campo lê no degrau de 15px, e não no de 16", () => {
      const actual = geometryOf(box.querySelector("input")!.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.omniboxPlaceholder, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.omniboxPlaceholder.style["font-weight"]));
    });

    it("a faixa de chips alinha com o botão, e não 4px para dentro", () => {
      expectPadding(chipsRow, SPEC.omniboxChips);
      expect(geometryOf(chipsRow.className).gap).toBe(numberOf(SPEC.omniboxChips, "gap"));
    });

    it("o chip é o degrau de 12,25px no padding 3/8", () => {
      const chip = chipsRow.querySelector("button")!;
      const actual = geometryOf(chip.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.omniboxChip, "font-size"));
      expect(actual.borderRadius).toBe(radiusOf(SPEC.omniboxChip));
      expectPadding(chip, SPEC.omniboxChip);
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

    it("o número da dica sai em mono, e só ele", () => {
      // Família não é medida, então o resolvedor de geometria a ignora — mas a
      // afirmação continua saindo do JSON: o spec declara `font-family` no nó
      // do número e **não** no da frase em volta.
      expect(stringOf(SPEC.kpiHintNumber, "font-family")).toContain("Source Code Pro");
      expect(SPEC.kpiHint.style["font-family"]).toBeUndefined();

      const [mono] = Array.from(hint.children);
      expect(mono.className).toMatch(/(?:^|\s)font-mono(?:\s|$)/);
      expect(mono.textContent).toBe("72%");
      expect(hint.textContent).toBe("72% do total");
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

    /** Onde cada seção aparece no arquivo — a ordem em que a página as monta. */
    function ordemNaPagina(): string[] {
      return Object.keys(sections)
        .map((name) => {
          const at = source.indexOf(`<${name}`);
          expect(at, `<${name}> não está na TasksPage`).toBeGreaterThan(-1);
          return [name, at] as const;
        })
        .sort((a, b) => a[1] - b[1])
        .map(([name]) => name);
    }

    it("o Omnibox abre a tela e as Entradas fecham, como no design", () => {
      const design = Object.entries(sections)
        .sort(([, a], [, b]) => bodyIndex(a) - bodyIndex(b))
        .map(([name]) => name);
      const pagina = ordemNaPagina();

      expect(pagina[0]).toBe(design[0]);
      expect(pagina.at(-1)).toBe(design.at(-1));
    });

    /**
     * **Exceção declarada (decisão do usuário, 2026-08-10).** O design empilha
     * KPI e Planejadas, um sob o outro, e é isso que o JSON diz. Medido na
     * bancada, a pilha deixava **96px** para as Entradas numa janela de 700 —
     * cabeçalho da seção e uma linha e pouco. Pareadas numa linha, as Entradas
     * passam a 213px e três linhas e meia, e o que se move são os **números**,
     * não os nomes: o cartão de KPI cai de 225,5 para 223,5 de largura, e a
     * linha de tarefa não encolhe em nenhuma das duas listas.
     *
     * A afirmação aqui é a decisão, não o mock — mas as duas pontas acima
     * continuam vindo do JSON, e é o que impede a exceção de virar licença.
     */
    it("KPI e Planejadas dividem a linha do meio", () => {
      expect(ordemNaPagina().slice(1, 3).sort()).toEqual(
        ["PlannedTasksSection", "TotalsSection"].sort()
      );
      // Uma linha só, e as duas metades pelo mesmo `flex-1`.
      expect(source).toMatch(/<div className="shrink-0 flex gap-5 items-start">/);
      expect(source.match(/className="flex-1 min-w-0"/g)).toHaveLength(2);
    });
  });

  describe("Badge", () => {
    const chip = shellOf(<Badge tone="billable">Billable</Badge>);

    it("é pílula, não retângulo de raio 6", () => {
      expect(geometryOf(chip.className).borderRadius).toBe(radiusOf(SPEC.rowChip));
    });

    it("tem o tamanho, o peso e o padding do chip de linha", () => {
      const actual = geometryOf(chip.className);
      expect(actual.fontSize).toBe(numberOf(SPEC.rowChip, "font-size"));
      expect(actual.fontWeight).toBe(Number(SPEC.rowChip.style["font-weight"]));
      expectPadding(chip, SPEC.rowChip);
    });
  });
});
