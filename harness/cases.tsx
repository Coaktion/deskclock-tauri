import { ChevronRight, Play } from "lucide-react";
import type { ReactElement } from "react";

import { chipBillableClass, chipEmptyClass } from "@presentation/components/chipStyles";
import { Badge } from "@presentation/components/ui/Badge";
import { Field } from "@presentation/components/ui/Field";
import { Input } from "@presentation/components/ui/Input";
import { KpiCard } from "@presentation/components/ui/KpiCard";
import { PageHeader } from "@presentation/components/ui/PageHeader";
import { SectionCard } from "@presentation/components/ui/SectionCard";
import { TaskRow } from "@presentation/components/ui/TaskRow";
import { TourButton } from "@presentation/components/ui/TourButton";

/**
 * Os casos da bancada visual: o mesmo componente que a app renderiza, com os
 * dados do mock, para medir e fotografar em Chromium de verdade.
 *
 * Cada caso diz **onde ele está no spec** (`anchor`) e **quanto espaço o mock
 * dá a ele** (`width`) — sem a largura, a linha mediria a largura da viewport e
 * a comparação de caixa renderizada não valeria nada.
 *
 * Importa de `components/ui/<arquivo>` e não do `index.ts` de propósito: o
 * barril arrasta primitivo que puxa contexto, e a bancada roda sem provider.
 */
/** A bancada mede caixa, não comportamento: o chip precisa de ação, e nada faz. */
const noop = () => {};

export interface VisualCase {
  /** Id do caso; nomeia o PNG e a linha do relatório. */
  id: string;
  /** Tela do spec (`docs/design-spec/telas-redesenhadas.json`). */
  screen: string;
  /** Caminho do nó equivalente no spec — o mesmo do screenGeometry. */
  anchor: string;
  /** Largura que o mock dá ao elemento, medida no próprio mock. */
  width: number;
  element: ReactElement;
}

export const CASES: VisualCase[] = [
  {
    // As três linhas do mock entram de verdade: com uma `<div />` vazia dentro, a
    // altura comparada era 46 contra 204 e não dizia nada sobre o componente.
    id: "section-card",
    screen: "3a",
    anchor: "1/1/1/2",
    width: 938,
    element: (
      <SectionCard title="Planejadas para hoje" count={3} action={<span>Ver semana →</span>}>
        <TaskRow
          title="Daily do time de produto"
          subtitle="Coaktion · Reunião"
          billable
          onToggleBillable={noop}
          dotColor="oklch(0.65 0.16 300)"
        />
        <TaskRow
          title="Revisão do fluxo de exportação"
          subtitle="Cliente A · Desenvolvimento"
          billable
          onToggleBillable={noop}
          dotColor="oklch(0.65 0.16 258)"
        />
        <TaskRow
          title="Organizar backlog da sprint"
          subtitle="Interno · Gestão"
          billable={false}
          onToggleBillable={noop}
          dotColor="oklch(0.55 0.02 264)"
        />
      </SectionCard>
    ),
  },
  {
    id: "task-row-planned",
    screen: "3a",
    anchor: "1/1/1/2/1",
    width: 936,
    element: (
      <TaskRow
        title="Daily do time de produto"
        subtitle="Coaktion · Reunião"
        billable
        onToggleBillable={noop}
        dotColor="oklch(0.65 0.16 300)"
        // O mesmo glifo de 14px do mock: um "▶" de texto mede outra coisa, e a
        // largura da coluna de ação é o que a comparação afirma.
        actions={
          <span className="flex p-1 text-fg-muted">
            <Play size={14} />
          </span>
        }
      />
    ),
  },
  {
    // A segunda forma do censo: chevron, faixa de 88px, nome com o ponto dentro.
    id: "task-row-entry",
    screen: "3a",
    anchor: "1/1/1/3/1",
    width: 936,
    element: (
      <TaskRow
        leading={
          <span className="flex text-fg-muted">
            <ChevronRight size={14} />
          </span>
        }
        meta={<span className="text-micro font-mono tabular-nums text-fg-muted">3 registros</span>}
        title="Ajustes no relatório mensal"
        subtitle="Cliente A · Desenvolvimento"
        duration="02:48:00"
        billable
        onToggleBillable={noop}
        dotColor="oklch(0.65 0.16 258)"
      />
    ),
  },
  {
    // A terceira: sem chevron, a faixa de horário abrindo a linha do Histórico.
    id: "task-row-history",
    screen: "3b",
    anchor: "1/1/1/3/1",
    width: 936,
    element: (
      <TaskRow
        meta={<span className="text-micro font-mono tabular-nums text-fg-muted">09:12–11:00</span>}
        title="Ajustes no relatório mensal"
        subtitle="Cliente A · Desenvolvimento"
        duration="01:48:00"
        billable
        onToggleBillable={noop}
        dotColor="oklch(0.65 0.16 258)"
      />
    ),
  },
  {
    id: "kpi-card",
    screen: "3a",
    anchor: "1/1/1/1/0",
    width: 225.5,
    element: (
      <KpiCard
        label="Billable hoje"
        value="04:12:38"
        hint="72% do total"
        tone="billable"
        barPct={72}
      />
    ),
  },
  {
    id: "page-header",
    screen: "3a",
    anchor: "1/1/0",
    width: 978,
    element: (
      <PageHeader
        title="Tarefas"
        // A saudação do mock, com o total do dia inline: sem ela a comparação
        // mediria um cabeçalho de título só, que é a divergência que a F3 fecha.
        context={
          <span className="min-w-0 truncate text-sm text-fg-muted">
            Boa tarde, Rafael ·{" "}
            <span className="font-mono tabular-nums text-fg-secondary">05:48:40</span> hoje
          </span>
        }
        onStartTour={() => {}}
      />
    ),
  },
  {
    // O `?` sozinho: dentro do `page-header` ele é o único resto do diff de
    // pixel daquele caso, e num círculo de 22px é o raio e a borda que denunciam.
    id: "tour-button",
    screen: "3a",
    anchor: "1/1/0/2/0",
    width: 22,
    element: <TourButton onClick={() => {}} />,
  },
  {
    id: "badge-billable",
    screen: "3a",
    anchor: "1/1/1/2/1/2",
    width: 48,
    element: <Badge tone="billable">Billable</Badge>,
  },
  {
    // Os chips do omnibox não têm componente próprio: são o vocabulário de
    // classe de `chipStyles.ts`, e o `<button>` aqui é o mesmo que o `Chip`
    // privado do `OmniboxIdle` escreve em volta deles.
    id: "omnibox-chip-vazio",
    screen: "3a",
    anchor: "1/1/1/0/1/0",
    width: 60,
    element: (
      <button type="button" className={chipEmptyClass}>
        Projeto
      </button>
    ),
  },
  {
    id: "omnibox-chip-billable",
    screen: "3a",
    anchor: "1/1/1/0/1/2",
    width: 62,
    element: (
      <button type="button" className={chipBillableClass}>
        Billable
      </button>
    ),
  },
  {
    // O campo com rótulo, que é o par overline + caixa. É aqui que a altura do
    // bloco aparece: a trava mede as classes do rótulo e o padding da caixa
    // separados, e o que o entalhe custava era justamente a soma dos dois.
    //
    // A largura é a da coluna do mock menos o padding dela (280 − 12 × 2), e o
    // `size="sm"` é o degrau que o spec mede nesta coluna — o mesmo que a
    // assertiva `o campo denso tem o padding 7/10` afirma.
    id: "field-sm",
    screen: "3e",
    anchor: "1/1/1/0/1/0",
    width: 256,
    element: (
      <Field label="Nome" htmlFor="bancada-nome">
        <Input id="bancada-nome" variant="bare" size="sm" placeholder="Nome da tarefa" readOnly />
      </Field>
    ),
  },
];
