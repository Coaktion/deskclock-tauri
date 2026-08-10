import { ChevronRight, Play } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { KpiCard } from "@presentation/components/ui/KpiCard";
import { SectionCard } from "@presentation/components/ui/SectionCard";
import { TaskRow } from "@presentation/components/ui/TaskRow";

/**
 * Composições de **tela inteira**, montadas com os primitivos de verdade.
 *
 * A app não consegue posar para a bancada: as páginas montam contexto, banco e
 * IPC do Tauri. Sem isto, arranjo — ordem, quem divide linha com quem, quanto
 * sobra para a última seção — só se discute por estimativa, que foi como as
 * duas primeiras rodadas de fidelidade erraram.
 *
 * Ficam fora de `CASES` de propósito: `pnpm visual` compara cada caso com o nó
 * equivalente do wireframe, e composição decidida **diverge** do wireframe por
 * escolha — a divergência é o assunto, não o defeito. Aqui a bancada é galeria:
 * `node harness/shot.mjs` fotografa por id, nos dois modos.
 *
 * A caixa é o orçamento real da tela, não uma largura confortável: 938×572 é o
 * que sobra de uma janela de 1100×700 depois da TitleBar (32), do cabeçalho
 * (56), da sidebar (68), do trilho (52) e do `p-5` do corpo.
 */
export interface Composicao {
  id: string;
  /** O que a foto responde. */
  nota: string;
  width: number;
  height: number;
  element: ReactElement;
}

const LARGURA = 938;
const ALTURA = 572;

/**
 * Substituto do Omnibox: ele monta contexto, banco e IPC, e o que interessa
 * aqui é a altura que ele ocupa. A anatomia é a do mock — linha de 40px com
 * `px-3 py-3`, faixa de chips com `px-4 pb-3`.
 */
function OmniboxStub() {
  return (
    <div className="shrink-0 bg-surface border border-border rounded-card">
      <div className="flex items-center gap-3 px-3 py-3">
        <span className="shrink-0 w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white">
          <Play size={18} />
        </span>
        <span className="flex-1 text-lead font-medium text-fg-muted">
          Em que você está trabalhando?
        </span>
      </div>
      <div className="flex gap-2 px-4 pb-3">
        <span className="rounded-chip border border-dashed border-border px-2 py-[3px] text-sm text-fg-muted">
          Projeto
        </span>
        <span className="rounded-chip border border-dashed border-border px-2 py-[3px] text-sm text-fg-muted">
          Categoria
        </span>
      </div>
    </div>
  );
}

const PLANEJADAS = [
  { nome: "Daily do time de produto", meta: "Coaktion · Reunião", cor: "var(--color-project-3)" },
  {
    nome: "Revisão do fluxo de exportação",
    meta: "Cliente A · Desenvolvimento",
    cor: "var(--color-project-1)",
  },
  { nome: "Organizar backlog da sprint", meta: "Interno · Gestão", cor: "var(--color-project-5)" },
  {
    nome: "Preparar apresentação do trimestre",
    meta: "Interno · Gestão",
    cor: "var(--color-project-2)",
  },
];

const ENTRADAS = [
  {
    nome: "Ajustes no relatório mensal de horas",
    meta: "Cliente A · Desenvolvimento",
    faixa: "3 registros",
    dur: "02:48:00",
    grupo: true,
    billable: true,
    cor: "var(--color-project-1)",
  },
  {
    nome: "Reunião de alinhamento com o cliente",
    meta: "Cliente B · Reunião",
    faixa: "13:30–13:48",
    dur: "00:18:00",
    grupo: false,
    billable: true,
    cor: "var(--color-project-4)",
  },
  {
    nome: "Organizar backlog da sprint",
    meta: "Interno · Gestão",
    faixa: "11:00–11:42",
    dur: "00:42:00",
    grupo: false,
    billable: false,
    cor: "var(--color-project-5)",
  },
  {
    nome: "Correção do cálculo de duração efetiva",
    meta: "Cliente A · Desenvolvimento",
    faixa: "09:12–11:00",
    dur: "01:48:00",
    grupo: true,
    billable: true,
    cor: "var(--color-project-1)",
  },
  {
    nome: "Triagem de tickets do suporte",
    meta: "Cliente B · Suporte",
    faixa: "08:30–09:12",
    dur: "00:42:00",
    grupo: false,
    billable: true,
    cor: "var(--color-project-4)",
  },
];

function LinhasPlanejadas() {
  return (
    <>
      {PLANEJADAS.map((t) => (
        <TaskRow
          key={t.nome}
          title={t.nome}
          subtitle={t.meta}
          billable
          dotColor={t.cor}
          actions={
            <span className="flex p-1 text-fg-muted">
              <Play size={14} />
            </span>
          }
        />
      ))}
    </>
  );
}

function LinhasEntradas() {
  return (
    <>
      {ENTRADAS.map((t) => (
        <TaskRow
          key={t.nome}
          leading={
            <span className="flex w-3.5 text-fg-muted">
              {t.grupo && <ChevronRight size={14} />}
            </span>
          }
          meta={<span className="text-micro font-mono tabular-nums text-fg-muted">{t.faixa}</span>}
          title={t.nome}
          subtitle={t.meta}
          duration={t.dur}
          billable={t.billable}
          dotColor={t.cor}
        />
      ))}
    </>
  );
}

const VER_SEMANA = <span className="text-accent-text">Ver semana →</span>;
const TOTAL_DIA = <span className="font-mono tabular-nums text-fg-secondary">05:48:40</span>;

/** O corpo da tela, com o mesmo `gap-5` e a mesma caixa das duas montagens. */
function Corpo({ children }: { children: ReactNode }) {
  return <div className="h-full flex flex-col gap-5 bg-canvas">{children}</div>;
}

/** A faixa de KPI nos dois arranjos — é a única coisa que muda entre as duas telas. */
function Kpis({ layout }: { layout: "row" | "grid" }) {
  return (
    <section
      className={`flex-1 min-w-0 ${layout === "grid" ? "grid grid-cols-2 gap-3" : "flex gap-3"}`}
    >
      <KpiCard label="Billable hoje" value="04:12:38" tone="billable" barPct={72} hint="72% do total" />
      <KpiCard label="Non-billable" value="01:36:02" tone="muted" barPct={28} hint="28% do total" />
      <KpiCard label="Total hoje" value="05:48:40" barPct={72} barTone="accent" hint="meta 8h" />
      <KpiCard label="Semana" value="27h12" barPct={68} barTone="accent" hint="meta 40h" />
    </section>
  );
}

export const COMPOSICOES: Composicao[] = [
  {
    id: "tasks-corpo",
    nota: "Com planejadas: KPI em 2×2 ao lado da lista, e as Entradas ficam com a altura que sobra.",
    width: LARGURA,
    height: ALTURA,
    element: (
      <Corpo>
        <OmniboxStub />
        <div className="shrink-0 flex gap-5 items-start">
          <SectionCard
            className="flex-1 min-w-0"
            title="Planejadas para hoje"
            count={4}
            action={VER_SEMANA}
            bodyClassName="max-h-[166px] overflow-y-auto"
          >
            <LinhasPlanejadas />
          </SectionCard>
          <Kpis layout="grid" />
        </div>
        <SectionCard
          className="flex-1 min-h-0 flex flex-col"
          title="Entradas de hoje"
          action={TOTAL_DIA}
          bodyClassName="min-h-0 overflow-y-auto"
        >
          <LinhasEntradas />
        </SectionCard>
      </Corpo>
    ),
  },
  {
    id: "tasks-corpo-sem-planejadas",
    nota: "Sem planejadas: a faixa de KPI volta aos quatro em linha, na largura toda.",
    width: LARGURA,
    height: ALTURA,
    element: (
      <Corpo>
        <OmniboxStub />
        <div className="shrink-0 flex gap-5 items-start">
          <Kpis layout="row" />
        </div>
        <SectionCard
          className="flex-1 min-h-0 flex flex-col"
          title="Entradas de hoje"
          action={TOTAL_DIA}
          bodyClassName="min-h-0 overflow-y-auto"
        >
          <LinhasEntradas />
        </SectionCard>
      </Corpo>
    ),
  },
];
