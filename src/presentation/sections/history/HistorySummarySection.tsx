import { Sparkles } from "lucide-react";
import { Button, SectionCard } from "@presentation/components/ui";
import { summaryButtonLabel, summaryProgressLabel } from "@presentation/hooks/daySummaries";
import { useDaySummaries } from "@presentation/hooks/useDaySummaries";
import { formatHistoryDayHeader } from "@shared/utils/time";

interface HistorySummarySectionProps {
  /** Os dias do resultado da busca atual, do mais recente para o mais antigo. */
  dateISOs: string[];
}

/**
 * O resumo por IA dos dias que a busca trouxe.
 *
 * **Sem provedor configurado a seção não existe** — nada de faixa convidando a
 * conectar. Quem apresenta a integração é o card na tela de Integrações; aqui
 * ela seria uma linha morta ocupando a tela de quem não a quer.
 *
 * **Nada é gerado sozinho.** O botão é o único caminho, e ele diz quantos dias
 * vai gerar antes do clique, porque cada dia é uma requisição paga.
 */
export function HistorySummarySection({ dateISOs }: HistorySummarySectionProps) {
  const { summaries, errors, skipped, progress, connected, running, generate } =
    useDaySummaries(dateISOs);

  const hasResult = summaries.length > 0 || errors.length > 0;
  if (!connected || (dateISOs.length === 0 && !hasResult)) return null;

  return (
    <div className="px-5 pt-5">
      <SectionCard
        title="Resumo por IA"
        action={
          dateISOs.length > 0 && (
            <Button
              variant="accent"
              size="sm"
              onClick={generate}
              loading={running}
              icon={<Sparkles size={14} />}
            >
              {progress
                ? summaryProgressLabel(progress.done, progress.total)
                : summaryButtonLabel(dateISOs.length)}
            </Button>
          )
        }
        bodyClassName="p-3 flex flex-col gap-3"
      >
        {!hasResult && !running && (
          <p className="text-sm text-fg-muted">Nenhum resumo gerado para esta busca.</p>
        )}

        {summaries.map((entry) => (
          <div key={entry.dateISO} className="flex flex-col gap-1">
            <p className="text-overline uppercase text-fg-muted">
              {formatHistoryDayHeader(entry.dateISO)}
            </p>
            <p className="text-body text-fg-secondary leading-relaxed">{entry.summary}</p>
          </div>
        ))}

        {/* Discreto de propósito: a falha de um dia não é o assunto da tela, e
            a mensagem já vem traduzida pelo `describeLlmError`. */}
        {errors.map((error) => (
          <p key={error.dateISO} className="text-xs text-danger">
            {formatHistoryDayHeader(error.dateISO)} — {error.message}
          </p>
        ))}

        {skipped.length > 0 && (
          <p className="text-xs text-fg-muted">
            {skipped.length === 1
              ? "1 dia não foi gerado por causa do limite do provedor."
              : `${skipped.length} dias não foram gerados por causa do limite do provedor.`}
          </p>
        )}
      </SectionCard>
    </div>
  );
}
