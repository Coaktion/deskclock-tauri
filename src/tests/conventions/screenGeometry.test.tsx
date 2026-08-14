import { render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRef, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import { FORM_COLUMN_WIDTH, formColumnClass } from "@presentation/components/fieldStyles";
import { OmniboxIdle } from "@presentation/components/OmniboxIdle";
import { ProjectCard } from "@presentation/components/ProjectCard";
import { Sidebar } from "@presentation/components/Sidebar";
import { AddRow } from "@presentation/components/ui/AddRow";
import { Badge } from "@presentation/components/ui/Badge";
import { Button } from "@presentation/components/ui/Button";
import { Field } from "@presentation/components/ui/Field";
import { FilterPill } from "@presentation/components/ui/FilterPill";
import { Input } from "@presentation/components/ui/Input";
import { KpiCard } from "@presentation/components/ui/KpiCard";
import { PageHeader } from "@presentation/components/ui/PageHeader";
import { SearchInput } from "@presentation/components/ui/SearchInput";
import { SectionCard, SectionRow } from "@presentation/components/ui/SectionCard";
import { TaskRow } from "@presentation/components/ui/TaskRow";
import { Toggle } from "@presentation/components/ui/Toggle";
import { IntegrationTile } from "@presentation/sections/integrations/shared";

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
 * (`docs-internal/design-spec/`, gerado por `scripts/extract-design-spec.mjs`).
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
 * A regra 2 pede um teste que reprova hoje, mas commitar as falhas soltas
 * deixaria o CI vermelho por sessões seguidas e, com ele vermelho, ninguém
 * distingue a divergência conhecida da regressão nova. Cada divergência medida
 * entra como `divergente(...)`, que é `it.fails`: passa **enquanto** a assertiva
 * reprova. Corrigir o componente faz o `it.fails` reprovar, e a única saída é
 * trocar `divergente` por `it` — corrigir sem declarar é impossível, e declarar
 * sem corrigir também. `divergente` que sobra é dívida visível; zero
 * `divergente` numa tela é a tela fiel.
 *
 * **A tela 3a está em zero**: as 15 divergências que a F0 mediu foram fechadas
 * entre a F1 e a F5. As 12 que a F6 mediu nas outras seis telas viraram **7** na
 * F7, que fechou o campo de formulário — o padding nos dois tamanhos e o rótulo,
 * que era a mesma peça repetida em quatro assertivas — e a coluna que o abriga.
 * E viraram **6** em 2026-08-12, quando o cartão do dia do Histórico adotou o
 * `SectionCard` e a faixa dele saiu de 8/12 para os 10/12 do spec.
 *
 * **Cobertura declarada, e o que falta:** aqui estão os componentes que
 * renderizam sem provider — mais o `OmniboxIdle` e a `Sidebar`, que pedem um
 * mock cada (ver os blocos deles) — e o que só existe na composição da página,
 * lido do **código-fonte**. Fora ficam os painéis que montam contexto, banco e
 * IPC: o corpo do Planejamento e do Lançamento Manual, os painéis de Dados e as
 * abas de Configurações são medidos pelos primitivos que os compõem, não
 * inteiros.
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

/**
 * A divergência medida e declarada. `it.fails` passa enquanto a assertiva
 * reprova, então a etapa que corrigir o componente **tem** de trocar isto por
 * `it` — é o que impede corrigir sem declarar e declarar sem corrigir.
 */
const divergente = it.fails;

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

/**
 * O código-fonte de um arquivo do app. É por aqui que entram as afirmações que
 * só existem na composição da página — a coluna de leitura, a ordem das seções,
 * o cabeçalho escrito à mão —, cujas páginas montam contexto, banco e IPC do
 * Tauri: renderizá-las pediria uma dúzia de mocks, e cada hook novo quebraria a
 * trava com um erro que não fala de geometria nenhuma.
 */
function sourceOf(path: string): string {
  return readFileSync(resolve(__dirname, "../../..", path), "utf8");
}

/** A classe de um elemento identificado por um trecho dela — o `p-5` do corpo,
 *  a régua do cabeçalho da semana no `WeekPlanningView`. */
function classNameContaining(source: string, marker: string): string {
  const found = new RegExp(`className="([^"]*${marker}[^"]*)"`).exec(source)?.[1];
  if (!found) throw new Error(`nenhuma className com "${marker}"`);
  return found;
}

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
        editingChip={null}
        setEditingChip={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        handleStart={() => Promise.resolve()}
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
        onToggleBillable={() => {}}
        dotColor="oklch(0.65 0.16 300)"
        actions={<button data-acoes="" />}
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
      // Pelo marcador, e não pelo primeiro `<button>` da linha: o chip de
      // faturamento também é botão, e vem antes das ações no DOM.
      const group = row.querySelector("[data-acoes]")?.parentElement;
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
          onToggleBillable={() => {}}
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
    const source = sourceOf("src/presentation/pages/TasksPage.tsx");

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

/**
 * As outras seis telas. Elas repetem a moldura da 3a — sidebar, `PageHeader`,
 * `SectionCard`, `TaskRow`, `KpiCard` —, então o que entra aqui é o que **só**
 * elas mostram: a coluna de leitura de 720px, a linha de configuração, a chave,
 * o campo de formulário, a pílula pequena e o ladrilho de integração.
 *
 * O número continua vindo do JSON **da tela em que o elemento aparece**, e não
 * do da 3a: ancorar tudo numa tela só faria a cobertura parecer maior do que é.
 */
describe("geometria: as outras seis telas contra o spec do design", () => {
  const s3b = screen("3b");
  const s3c = screen("3c");
  const s3d = screen("3d");
  const s3e = screen("3e");
  const s3f = screen("3f");
  const s3g = screen("3g");

  describe("3b · Histórico", () => {
    const SPEC_3B = {
      acao: s3b.byText("Filtros"),
      periodo: s3b.byText("Hoje"),
      busca: s3b.byPath("1/1/1/0/5/1"),
      diaHeader: s3b.byPath("1/1/1/3/0"),
    };

    it("o botão de ação do cabeçalho tem o padding, o raio e o gap do spec", () => {
      const botao = shellOf(<Button icon={<span />}>Filtros</Button>);
      const actual = geometryOf(botao.className);
      expectPadding(botao, SPEC_3B.acao);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3B.acao));
      expect(actual.gap).toBe(numberOf(SPEC_3B.acao, "gap"));
      expect(actual.fontSize).toBe(numberOf(SPEC_3B.acao, "font-size"));
    });

    it("a pílula de período é a pílula de 6/12 no degrau de 12,25px", () => {
      const pill = shellOf(<FilterPill onClick={() => {}}>Hoje</FilterPill>);
      const actual = geometryOf(pill.className);
      expectPadding(pill, SPEC_3B.periodo);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3B.periodo));
      expect(actual.fontSize).toBe(numberOf(SPEC_3B.periodo, "font-size"));
    });

    it("a busca abre 32px à esquerda para a lupa", () => {
      const busca = shellOf(<SearchInput value="" onChange={() => {}} />);
      const campo = busca.querySelector("input")!;
      expect(geometryOf(campo.className).paddingLeft).toBe(paddingOf(SPEC_3B.busca).left);
    });

    /**
     * O padding do campo é o mesmo em todas as telas que têm formulário. Está
     * aqui, e não só na 3d, porque é o campo da busca que a 3b desenha.
     */
    it("a busca tem o padding do campo do spec", () => {
      const busca = shellOf(<SearchInput value="" onChange={() => {}} />);
      const campo = busca.querySelector("input")!;
      const actual = geometryOf(campo.className);
      expect(actual.paddingTop).toBe(paddingOf(SPEC_3B.busca).top);
      expect(actual.paddingRight).toBe(paddingOf(SPEC_3B.busca).right);
    });

    /**
     * O cartão do dia é o `SectionCard`, e por isso a faixa mede 10/12 aqui como
     * mede na 3a e na 3e. Enquanto ele foi escrito à mão — para fugir do
     * `overflow-hidden` da casca, que prenderia o cabeçalho `sticky` de dentro ao
     * topo do próprio cartão — a faixa media 8/12 e esta trava era `divergente`.
     * O `sticky` saiu, o cartão adotou o primitivo, e a medida fechou.
     */
    it("o cabeçalho do dia tem o padding da faixa", () => {
      const dia = shellOf(
        <SectionCard title="Hoje · 07/08">
          <div />
        </SectionCard>
      );
      expectPadding(dia.children[0], SPEC_3B.diaHeader);

      // Medir o primitivo só vale enquanto for ele que a tela usa: escrito à mão
      // de novo, o cartão voltaria aos 8/12 com esta trava verde.
      expect(sourceOf("src/presentation/pages/HistoryPage.tsx")).toContain("<SectionCard");
    });
  });

  describe("3c · Dados", () => {
    const SPEC_3C = {
      corpo: s3c.byPath("1/1/1"),
      coluna: s3c.byPath("1/1/1/0"),
      abas: s3c.byPath("1/1/0/1"),
      importar: s3c.byText("Importar"),
      linha: s3c.byPath("1/1/1/0/1/1"),
      ponto: s3c.byPath("1/1/1/0/1/1/1"),
      nome: s3c.byText("Cliente A"),
      pilula: s3c.byPath("1/1/1/0/1/1/3"),
      adicionar: s3c.byPath("1/1/1/0/1/5"),
      adicionarTexto: s3c.byText("Adicionar novo projeto — Enter para salvar"),
    };

    /** Um projeto qualquer: a linha mede a mesma coisa com qualquer nome. */
    const projeto = { id: "p1", workspaceId: "w1", name: "Cliente A", colorIndex: 0 };

    /** `associadas` governa o rótulo da pílula: o mock desenha as duas formas. */
    function linhaDeProjeto(associadas = 0): HTMLElement {
      const sourceById = new Map(
        Array.from({ length: associadas }, (_, i) => [`c${i}`, "manual" as const])
      );
      return shellOf(
        <ProjectCard
          project={projeto}
          selected={false}
          onToggleSelect={() => {}}
          onUpdate={async () => {}}
          onDelete={() => {}}
          categories={[]}
          sourceById={sourceById}
          onToggleCategory={() => {}}
          onClearCategories={() => {}}
        />
      ).children[0] as HTMLElement;
    }

    it("o corpo tem o padding de página e a coluna de leitura do spec", () => {
      const source = sourceOf("src/presentation/pages/DataPage.tsx");
      expectPadding(classNameContaining(source, "overflow-y-auto"), SPEC_3C.corpo);
      expect(source).toContain(`max-w-[${numberOf(SPEC_3C.coluna, "max-width")}px]`);
    });

    /**
     * A coluna é a pilha de busca + cartão, e o degrau entre os dois é dela. Ele
     * só existe desde que a busca saiu de dentro do cartão — antes ela dividia
     * uma linha com o botão de importar, que é ação da tela e subiu para o
     * cabeçalho.
     */
    it("a coluna empilha busca e cartão no degrau do spec", () => {
      const coluna = classNameContaining(
        sourceOf("src/presentation/pages/DataPage.tsx"),
        "max-w-\\[720px\\]"
      );
      expect(geometryOf(coluna).gap).toBe(numberOf(SPEC_3C.coluna, "gap"));
      expect(coluna).toContain("flex-col");
    });

    it("as abas ficam coladas ao título, no gap do spec", () => {
      const header = shellOf(<PageHeader title="Dados" tabs={<span data-abas="" />} />);
      const abas = header.querySelector("[data-abas]")!.parentElement!;
      const actual = geometryOf(abas.className);
      expect(actual.gap).toBe(numberOf(SPEC_3C.abas, "gap"));
      expect(actual.marginLeft).toBe(numberOf(SPEC_3C.abas, "margin-left"));
    });

    it("a importação em massa é a ação do cabeçalho, no padding e no raio do spec", () => {
      const botao = shellOf(<Button icon={<span />}>Importar</Button>);
      const actual = geometryOf(botao.className);
      expectPadding(botao, SPEC_3C.importar);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3C.importar));
      expect(actual.gap).toBe(numberOf(SPEC_3C.importar, "gap"));

      // Medir o `Button` só vale enquanto for a página que o monta: de volta ao
      // painel, ele estaria certo no lugar errado com esta trava verde.
      expect(sourceOf("src/presentation/pages/DataPage.tsx")).toContain("Importar");
    });

    it("a linha da lista tem o padding, o gap e a régua do spec", () => {
      const linha = linhaDeProjeto();
      expectPadding(linha, SPEC_3C.linha);
      expect(geometryOf(linha.className).gap).toBe(numberOf(SPEC_3C.linha, "gap"));

      // A régua vem do `divide-y` do contêiner, como no cartão de configurações
      // — a linha não a escreve, e escrevê-la duplicaria o filete no rodapé.
      expect(linha.className).not.toMatch(/(?:^|\s)rounded-/);
      expect(sourceOf("src/presentation/components/ProjectsPanel.tsx")).toContain(
        "divide-y divide-border-subtle"
      );
    });

    it("o ponto de projeto tem o diâmetro do spec", () => {
      const ponto = linhaDeProjeto().children[1];
      const actual = geometryOf(ponto.className);
      expect(actual.width).toBe(numberOf(SPEC_3C.ponto, "width"));
      expect(actual.height).toBe(numberOf(SPEC_3C.ponto, "height"));
    });

    it("a pílula de categorias é o `Badge`, e diz quantas são", () => {
      const pilula = linhaDeProjeto(4).querySelector("[aria-expanded] > span")!;
      const actual = geometryOf(pilula.className);
      expectPadding(pilula, SPEC_3C.pilula);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3C.pilula));
      expect(actual.fontSize).toBe(numberOf(SPEC_3C.pilula, "font-size"));
      expect(actual.gap).toBe(numberOf(SPEC_3C.pilula, "gap"));

      // O mock escreve o substantivo (`4 categorias`), e o número sozinho não
      // diz de quê. Sem associação a pílula é tracejada e diz "todas" — é o
      // projeto que oferece o catálogo inteiro (§6.4).
      expect(pilula.textContent).toBe(`4 ${SPEC_3C.pilula.text}`);
      expect(linhaDeProjeto().querySelector("[aria-expanded] > span")!.className).toContain(
        "border-dashed"
      );
    });

    it("a linha de adicionar tem o padding e o gap do spec, e não é bloco solto", () => {
      const linha = shellOf(
        <AddRow>
          <span />
        </AddRow>
      );
      expectPadding(linha, SPEC_3C.adicionar);
      expect(geometryOf(linha.children[0].className).gap).toBe(
        numberOf(SPEC_3C.adicionar, "gap")
      );
      expect(linha.className).not.toMatch(/border-dashed|rounded-/);
    });

    it("o placeholder de adicionar lê no degrau do spec", () => {
      const linha = shellOf(
        <AddRow>
          <Input variant="plain" value="" onChange={() => {}} placeholder="Adicionar" />
        </AddRow>
      );
      const campo = linha.querySelector("input")!;
      expect(geometryOf(campo.className).fontSize).toBe(
        numberOf(SPEC_3C.adicionarTexto, "font-size")
      );
    });
  });

  describe("3d · Configurações", () => {
    const SPEC_3D = {
      corpo: s3d.byPath("1/1/1"),
      coluna: s3d.byPath("1/1/1/0"),
      linha: s3d.byPath("1/1/1/0/1/1"),
      chave: s3d.byPath("1/1/1/0/1/1/1"),
      knob: s3d.byPath("1/1/1/0/1/1/1/0"),
      rotulo: s3d.byText("Iniciar com o sistema"),
      dica: s3d.byText("Abre o DeskClock ao ligar o computador"),
      campo: s3d.byText("Rafael"),
      aba: s3d.byText("Atalhos"),
    };

    it("o corpo tem o padding de página e a coluna de leitura do spec", () => {
      const source = sourceOf("src/presentation/pages/SettingsPage.tsx");
      expectPadding(classNameContaining(source, "overflow-y-auto"), SPEC_3D.corpo);
      expect(source).toContain(`max-w-[${numberOf(SPEC_3D.coluna, "max-width")}px]`);
    });

    /**
     * A pilha de cartões respira mais que a lista de Dados — 20 contra 12, e as
     * duas medidas são do spec da tela em que aparecem. Ela mora nas abas que
     * têm mais de um cartão, e não na página, que hospeda uma aba por vez.
     */
    it("a pilha de cartões respira no degrau do spec", () => {
      for (const aba of ["GeralTab", "AtalhosTab", "ApiTab"]) {
        const source = sourceOf(`src/presentation/sections/settings/${aba}.tsx`);
        expect(geometryOf(classNameContaining(source, "space-y-")).gap).toBe(
          numberOf(SPEC_3D.coluna, "gap")
        );
      }
    });

    /**
     * As abas são a pílula no tamanho cheio, como as de Dados — o `sm` que a
     * tela passava é o degrau da pílula de semana do Planejamento.
     */
    it("as abas são a pílula de 6/12, sem tamanho próprio", () => {
      const aba = shellOf(<FilterPill onClick={() => {}}>Atalhos</FilterPill>);
      expectPadding(aba, SPEC_3D.aba);
      expect(sourceOf("src/presentation/pages/SettingsPage.tsx")).not.toContain('size="sm"');
    });

    it("a chave é 40×20 com knob de 16, e a linha dela tem o gap do spec", () => {
      const linha = shellOf(
        <Toggle
          checked={false}
          onChange={() => {}}
          label="Iniciar com o sistema"
          description="Abre o DeskClock ao ligar o computador"
        />
      );
      const trilho = linha.querySelector("button")!;
      const knob = trilho.firstElementChild!;

      expect(geometryOf(linha.className).gap).toBe(numberOf(SPEC_3D.linha, "gap"));
      const chave = geometryOf(trilho.className);
      expect(chave.width).toBe(numberOf(SPEC_3D.chave, "width"));
      expect(chave.height).toBe(numberOf(SPEC_3D.chave, "height"));
      expect(chave.borderRadius).toBe(radiusOf(SPEC_3D.chave));
      expect(geometryOf(knob.className).width).toBe(numberOf(SPEC_3D.knob, "width"));
    });

    it("o rótulo e a dica da linha ficam nos dois degraus do spec", () => {
      const linha = shellOf(
        <Toggle
          checked={false}
          onChange={() => {}}
          label="Iniciar com o sistema"
          description="Abre o DeskClock ao ligar o computador"
        />
      );
      const [rotulo, dica] = Array.from(linha.querySelectorAll("p"));
      expect(geometryOf(rotulo.className).fontSize).toBe(numberOf(SPEC_3D.rotulo, "font-size"));
      expect(geometryOf(dica.className).fontSize).toBe(numberOf(SPEC_3D.dica, "font-size"));
    });

    /** O mesmo 1px que o `TaskRow` já usa no subtítulo. Ele vale para as cinco
     *  linhas de configuração porque o par rótulo+dica mora no `SettingLabel`. */
    it("a dica encosta no rótulo com 1px", () => {
      const linha = shellOf(
        <Toggle
          checked={false}
          onChange={() => {}}
          label="Iniciar com o sistema"
          description="Abre o DeskClock ao ligar o computador"
        />
      );
      const dica = linha.querySelectorAll("p")[1];
      expect(geometryOf(dica.className).marginTop).toBe(numberOf(SPEC_3D.dica, "margin-top"));
    });

    it("a linha de configuração tem o padding do spec", () => {
      const linha = shellOf(<SectionRow>linha</SectionRow>);
      expectPadding(linha, SPEC_3D.linha);
    });

    /**
     * O campo `md` — o de Configurações e o dos modais. O raio e o degrau de
     * texto batem; o padding não, nos dois eixos.
     */
    it("o campo tem o raio e o degrau de texto do spec", () => {
      const campo = shellOf(<Input value="Rafael" onChange={() => {}} />);
      const actual = geometryOf(campo.className);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3D.campo));
      expect(actual.fontSize).toBe(numberOf(SPEC_3D.campo, "font-size"));
    });

    it("o campo tem o padding 7/12 do spec", () => {
      const campo = shellOf(<Input value="Rafael" onChange={() => {}} />);
      expectPadding(campo, SPEC_3D.campo);
    });

    /**
     * A linha do nome é a linha comum da tela — rótulo e dica à esquerda, campo
     * de largura fixa à direita —, e não o bloco de perfil com avatar que ela
     * foi até a F9. A largura é do call site, então é lá que se mede.
     *
     * **Ela tem de estar no invólucro, e a segunda assertiva é o que garante.**
     * `controlClass` emite `w-full`, e entre dois utilitários de `width` quem
     * vence é a ordem de emissão do Tailwind, não a ordem na string — uma
     * largura passada ao campo resolve 180 aqui e renderiza cheia na tela.
     * Foi o que aconteceu na primeira versão desta linha.
     */
    it("o campo do nome tem a largura do spec, e ela mora no invólucro", () => {
      const source = sourceOf("src/presentation/sections/settings/GeralTab.tsx");
      expect(geometryOf(classNameContaining(source, "w-45")).width).toBe(
        numberOf(SPEC_3D.campo, "width")
      );

      const campo = /<Input\b[\s\S]*?\/>/.exec(source)?.[0] ?? "";
      expect(campo).not.toMatch(/\bw-/);
    });
  });

  describe("3e · Planejamento", () => {
    const SPEC_3E = {
      semana: s3e.byText("Semana atual"),
      dia: s3e.byText("Seg"),
      coluna: s3e.byPath("1/1/1/0"),
      corpoColuna: s3e.byPath("1/1/1/0/1"),
      rotulo: s3e.byText("Nome"),
      campo: s3e.byPath("1/1/1/0/1/0/1"),
      filtroDias: s3e.byPath("1/1/1/1/0"),
      semana7: s3e.byPath("1/1/1/1/1"),
      cartaoDia: s3e.byPath("1/1/1/1/1/0"),
      cartaoHoje: s3e.byPath("1/1/1/1/1/1"),
      faixaHoje: s3e.byPath("1/1/1/1/1/1/0"),
      linhaDia: s3e.byPath("1/1/1/1/1/0/1"),
      pontoDia: s3e.byPath("1/1/1/1/1/0/1/0"),
      acoesDia: s3e.byPath("1/1/1/1/1/1/1/3"),
    };

    it("a pílula de dia é a mesma pílula de 6/12 do Histórico", () => {
      const pill = shellOf(<FilterPill onClick={() => {}}>Seg</FilterPill>);
      expectPadding(pill, SPEC_3E.dia);
      expect(geometryOf(pill.className).fontSize).toBe(numberOf(SPEC_3E.dia, "font-size"));
    });

    it("a pílula pequena tem o padding 4/10 do spec", () => {
      const pill = shellOf(
        <FilterPill size="sm" onClick={() => {}}>
          Semana atual
        </FilterPill>
      );
      expectPadding(pill, SPEC_3E.semana);
    });

    /** Ela é a única pílula do app que o design escreve num degrau menor que o
     *  `body/ui` — 11px, que é o `text-micro` que a F0 criou. */
    divergente("a pílula pequena lê no degrau de 11px — divergente", () => {
      const pill = shellOf(
        <FilterPill size="sm" onClick={() => {}}>
          Semana atual
        </FilterPill>
      );
      expect(geometryOf(pill.className).fontSize).toBe(numberOf(SPEC_3E.semana, "font-size"));
    });

    it("a coluna de formulário nasce nos 280px do spec", () => {
      // A largura é arrastável (`useResizablePanel`), então o que se compara é
      // o padrão: é ele que a tela mostra a quem nunca arrastou.
      expect(FORM_COLUMN_WIDTH.default).toBe(numberOf(SPEC_3E.coluna, "width"));
    });

    /**
     * O padrão precisa ser **um** número. `useResizablePanel` só cai no
     * `defaultSize` quando o gravado é 0, e a config nunca devolve 0 — devolve o
     * `DEFAULTS` dela. Enquanto os dois estiveram escritos à mão, o de cima
     * afirmava 280 e a tela abria com o de baixo.
     */
    it("o padrão da config é o mesmo do primitivo, e não um segundo número", () => {
      const source = sourceOf("src/presentation/contexts/ConfigContext.tsx");
      expect(source).toContain("planningFormWidth: FORM_COLUMN_WIDTH.default");
      expect(source).toContain("retroactiveFormWidth: FORM_COLUMN_WIDTH.default");
    });

    it("o corpo da coluna tem o padding e o ritmo do spec", () => {
      // A classe é constante exportada, não `className` de JSX: o corpo da
      // coluna é escrito por dois formulários e a medida mora no módulo.
      const actual = geometryOf(formColumnClass);
      expectPadding(formColumnClass, SPEC_3E.corpoColuna);
      expect(actual.gap).toBe(numberOf(SPEC_3E.corpoColuna, "gap"));
    });

    /**
     * O rótulo é **overline acima da caixa** (10px/600), e é o `Field` que o
     * escreve. Eram quatro grafias — o entalhe do próprio `Field`, o mesmo
     * entalhe em classes no `EditTaskModal`, o rótulo flutuante dos campos
     * personalizados e o `<label>` solto —, colapsadas na F7.
     */
    it("o rótulo do campo é o overline de 10px", () => {
      const campo = shellOf(
        <Field label="Nome">
          <Input variant="bare" />
        </Field>
      );
      const rotulo = geometryOf(campo.querySelector("label")!.className);
      expect(rotulo.fontSize).toBe(numberOf(SPEC_3E.rotulo, "font-size"));
      expect(rotulo.fontWeight).toBe(Number(SPEC_3E.rotulo.style["font-weight"]));
    });

    it("o campo denso tem o padding 7/10 do spec", () => {
      const campo = shellOf(<Input size="sm" />);
      expectPadding(campo, SPEC_3E.campo);
    });

    /**
     * A semana é lida do código-fonte, no molde que a F3 usou na `TasksPage`: o
     * `WeekPlanningView` monta repositórios, banco e IPC, e uma dúzia de mocks
     * faria cada hook novo quebrar a trava com um erro que não fala de
     * geometria. O que se afirma aqui está inteiro na classe dos dois blocos.
     */
    it("a linha de dias e o corpo da semana têm o padding e o degrau do spec", () => {
      const source = sourceOf("src/presentation/components/WeekPlanningView.tsx");
      expectPadding(
        classNameContaining(source, "border-b border-border-subtle shrink-0"),
        SPEC_3E.filtroDias
      );

      const corpo = classNameContaining(source, "overflow-y-auto");
      expectPadding(corpo, SPEC_3E.semana7);
      expect(geometryOf(corpo).gap).toBe(numberOf(SPEC_3E.semana7, "gap"));
    });

    /**
     * O dia é um `SectionCard`, e o dia corrente é o **mesmo** cartão no tom de
     * acento — casca, faixa, régua, título e pílula trocam juntos. Escrito no
     * call site, o cartão de hoje seria a faixa desenhada em dois lugares.
     */
    it("o cartão do dia é o cartão de seção, e o de hoje é o mesmo em acento", () => {
      const hoje = shellOf(
        <SectionCard title="Sex, 07/08 · hoje" tone="accent">
          <div />
        </SectionCard>
      );
      const faixa = hoje.children[0];

      expect(geometryOf(hoje.className).borderRadius).toBe(radiusOf(SPEC_3E.cartaoHoje));
      expect(SPEC_3E.cartaoHoje.style.overflow).toBe("hidden");
      expectBackground(faixa, SPEC_3E.faixaHoje);
      expectBottomRule(faixa, SPEC_3E.faixaHoje);

      // O tom não pode ser inerte: o spec pinta a faixa de hoje com outra cor
      // (`accent/8` contra o `surface` do dia comum), e é a única coisa que
      // separa os dois cartões.
      const comum = shellOf(
        <SectionCard title="Seg, 03/08">
          <div />
        </SectionCard>
      );
      expect(geometryOf(comum.className).borderRadius).toBe(radiusOf(SPEC_3E.cartaoDia));
      expect(faixa.className).not.toBe(comum.children[0].className);
    });

    /**
     * A linha planejada é a **forma A** do `TaskRow` — nada precede o nome, então
     * o ponto de projeto abre coluna própria. Ela era flex e sem ponto: o
     * faturamento e a cor do projeto eram as duas coisas que faltavam para a
     * lista falar a mesma língua da 3a e da 3f.
     */
    it("a linha planejada é a grade de quatro colunas com o ponto do projeto", () => {
      const row = shellOf(
        <TaskRow
          title="Revisão de PRs"
          subtitle="Cliente A · Desenvolvimento"
          dotColor="oklch(0.65 0.16 258)"
          billable
          onToggleBillable={() => {}}
          collapseActions
          actions={<span />}
        />
      );
      const actual = geometryOf(row.className);

      expect(actual.gridTemplateColumns).toBe(
        stringOf(SPEC_3E.linhaDia, "grid-template-columns").replace(/\s+/g, " ")
      );
      expect(actual.gap).toBe(numberOf(SPEC_3E.linhaDia, "gap"));
      expectPadding(row, SPEC_3E.linhaDia);

      const ponto = row.firstElementChild!;
      const dot = geometryOf(ponto.className);
      expect(dot.width).toBe(numberOf(SPEC_3E.pontoDia, "width"));
      expect(dot.height).toBe(numberOf(SPEC_3E.pontoDia, "height"));
      expect(dot.borderRadius).toBe(radiusOf(SPEC_3E.pontoDia));
    });

    /**
     * Com cinco botões, a coluna reservada sai do `1fr` do nome. `collapseActions`
     * fecha a célula em **largura** até o hover — é a §5.3, agora no primitivo.
     */
    it("as ações da linha planejada fecham em largura até o hover, no gap do spec", () => {
      const row = shellOf(
        <TaskRow title="Revisão de PRs" collapseActions actions={<span data-acoes="" />} />
      );
      const acoes = row.querySelector("[data-acoes]")!.parentElement!;

      expect(geometryOf(acoes.className).gap).toBe(numberOf(SPEC_3E.acoesDia, "gap"));
      expect(acoes.className).toMatch(/(?:^|\s)w-0(?:\s|$)/);
      expect(acoes.className).toMatch(/(?:^|\s)group-hover:w-auto(?:\s|$)/);
    });
  });

  describe("3f · Lançamento manual", () => {
    const SPEC_3F = {
      hoje: s3f.byText("Hoje"),
      linha: s3f.byPath("1/1/1/1/0/1"),
      faixa: s3f.byPath("1/1/1/1/0/1/0"),
    };

    it("a linha de apontamento é a grade de 88px do spec", () => {
      // Sem `leading`: o Lançamento Manual não agrupa, então a coluna do
      // chevron não existe — é a forma de quatro colunas, não a de cinco.
      const row = shellOf(
        <TaskRow
          meta={<span>09:12–11:00</span>}
          title="Ajustes no relatório mensal"
          subtitle="Cliente A · Desenvolvimento"
          duration="01:48"
          billable
          onToggleBillable={() => {}}
          dotColor="oklch(0.65 0.16 258)"
        />
      );
      const actual = geometryOf(row.className);
      expect(actual.gridTemplateColumns).toBe(
        stringOf(SPEC_3F.linha, "grid-template-columns").replace(/\s+/g, " ")
      );
      expect(actual.gap).toBe(numberOf(SPEC_3F.linha, "gap"));
      expectPadding(row, SPEC_3F.linha);
    });

    it("a faixa de horário lê no degrau de 11px", () => {
      const faixa = shellOf(
        <span className="text-micro font-mono tabular-nums text-fg-muted">09:12–11:00</span>
      );
      expect(geometryOf(faixa.className).fontSize).toBe(numberOf(SPEC_3F.faixa, "font-size"));
    });

    divergente("a pílula do dia navegado lê no degrau de 11px — divergente", () => {
      const pill = shellOf(
        <FilterPill size="sm" onClick={() => {}}>
          Hoje
        </FilterPill>
      );
      expect(geometryOf(pill.className).fontSize).toBe(numberOf(SPEC_3F.hoje, "font-size"));
    });
  });

  describe("3g · Integrações", () => {
    const SPEC_3G = {
      corpo: s3g.byPath("1/1/1"),
      coluna: s3g.byPath("1/1/1/0"),
      ladrilho: s3g.byPath("1/1/1/0/0"),
      logo: s3g.byPath("1/1/1/0/0/0"),
      nome: s3g.byText("Google"),
    };

    it("o corpo tem o padding de página e a coluna de leitura do spec", () => {
      const source = sourceOf("src/presentation/pages/IntegrationsPage.tsx");
      expectPadding(classNameContaining(source, "overflow-y-auto"), SPEC_3G.corpo);
      expect(source).toContain(`max-w-[${numberOf(SPEC_3G.coluna, "max-width")}px]`);
    });

    it("o ladrilho tem o padding, o raio e a caixa do logo do spec", () => {
      const tile = shellOf(
        <IntegrationTile
          logo={<span />}
          name="Google"
          description="Sheets e Calendar com uma única conta"
          connected
          onClick={() => {}}
        />
      );
      const actual = geometryOf(tile.className);
      expectPadding(tile, SPEC_3G.ladrilho);
      expect(actual.borderRadius).toBe(radiusOf(SPEC_3G.ladrilho));

      const logo = geometryOf(tile.firstElementChild!.className);
      expect(logo.width).toBe(numberOf(SPEC_3G.logo, "width"));
      expect(logo.height).toBe(numberOf(SPEC_3G.logo, "height"));
      expect(logo.borderRadius).toBe(radiusOf(SPEC_3G.logo));
    });

    it("o nome do serviço é o degrau de 12,25px em peso 600", () => {
      const tile = shellOf(
        <IntegrationTile
          logo={<span />}
          name="Google"
          description="Sheets e Calendar com uma única conta"
          connected
          onClick={() => {}}
        />
      );
      const nome = geometryOf(tile.children[1].firstElementChild!.className);
      expect(nome.fontSize).toBe(numberOf(SPEC_3G.nome, "font-size"));
      expect(nome.fontWeight).toBe(Number(SPEC_3G.nome.style["font-weight"]));
    });

    divergente("o ladrilho tem o gap de 14 do spec — divergente, 16 hoje", () => {
      const tile = shellOf(
        <IntegrationTile
          logo={<span />}
          name="Google"
          description="Sheets e Calendar com uma única conta"
          connected
          onClick={() => {}}
        />
      );
      expect(geometryOf(tile.className).gap).toBe(numberOf(SPEC_3G.ladrilho, "gap"));
    });
  });
});
