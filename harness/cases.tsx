import type { ReactElement } from "react";

import { Badge } from "@presentation/components/ui/Badge";
import { KpiCard } from "@presentation/components/ui/KpiCard";
import { PageHeader } from "@presentation/components/ui/PageHeader";
import { SectionCard } from "@presentation/components/ui/SectionCard";
import { TaskRow } from "@presentation/components/ui/TaskRow";

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
          dotColor="oklch(0.65 0.16 300)"
        />
        <TaskRow
          title="Revisão do fluxo de exportação"
          subtitle="Cliente A · Desenvolvimento"
          billable
          dotColor="oklch(0.65 0.16 258)"
        />
        <TaskRow
          title="Organizar backlog da sprint"
          subtitle="Interno · Gestão"
          billable={false}
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
        dotColor="oklch(0.65 0.16 300)"
        actions={<span style={{ display: "flex", padding: 4 }}>▶</span>}
      />
    ),
  },
  {
    id: "task-row-entry",
    screen: "3a",
    anchor: "1/1/1/3/1",
    width: 936,
    element: (
      <TaskRow
        title="Ajustes no relatório mensal"
        subtitle="Cliente A · Desenvolvimento"
        duration="02:48:00"
        billable
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
    element: <PageHeader title="Tarefas" onStartTour={() => {}} />,
  },
  {
    id: "badge-billable",
    screen: "3a",
    anchor: "1/1/1/2/1/2",
    width: 48,
    element: <Badge tone="billable">Billable</Badge>,
  },
];
