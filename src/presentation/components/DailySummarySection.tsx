import { RefreshCw } from "lucide-react";
import { IconButton, SectionCard } from "@presentation/components/ui";
import { dailySummaryTitle } from "@presentation/hooks/dailySummary";
import { useDailySummary } from "@presentation/hooks/useDailySummary";

/**
 * O resumo, gerado por IA, do último dia com trabalho registrado.
 *
 * **Sem provedor configurado a seção não existe** — nada de faixa convidando a
 * conectar. Quem apresenta a integração é o card na tela de Integrações; aqui
 * ela seria uma linha morta ocupando a tela de quem não a quer.
 *
 * O `shrink-0` mora na casca, e não num invólucro na página: um invólucro vazio
 * continuaria contando como filho do corpo e abriria mais um degrau de `gap-5`
 * entre os KPIs e as Entradas justamente quando não há resumo.
 */
export function DailySummarySection() {
  const { status, dateISO, summary, error, reload } = useDailySummary();

  if (status === "idle") return null;

  return (
    <SectionCard
      className="shrink-0"
      title={dailySummaryTitle(dateISO)}
      action={
        <IconButton
          icon={<RefreshCw size={14} />}
          title="Recarregar resumo"
          onClick={reload}
          disabled={status === "loading"}
        />
      }
      bodyClassName="p-3 flex flex-col gap-2"
    >
      {status === "loading" && <p className="text-sm text-fg-muted">Gerando resumo…</p>}
      {summary && <p className="text-body text-fg-secondary leading-relaxed">{summary}</p>}
      {error && <p className="text-xs text-danger">{error}</p>}
    </SectionCard>
  );
}
