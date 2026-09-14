import { RotateCw } from "lucide-react";
import { Button, SectionCard } from "@presentation/components/ui";
import { summaryProgressLabel, summaryScopeNote } from "@presentation/hooks/daySummaries";
import type { DaySummariesState } from "@presentation/hooks/useDaySummaries";
import { LlmLogo } from "@presentation/sections/integrations/llm/LlmLogo";
import { formatHistoryDayHeader } from "@shared/utils/time";

interface HistorySummarySectionProps extends DaySummariesState {
  /** Os dias do resultado da busca atual, do mais recente para o mais antigo. */
  dateISOs: string[];
  /** Retentar o que falhou ou ficou sem gerar. */
  onRetry: () => void;
}

/**
 * O resumo por IA dos dias que a busca trouxe — o corpo da aba "Resumo".
 *
 * **Quem chama o `useDaySummaries` é a página, não esta seção.** A aba desmonta
 * ao sair dela, e o estado precisa sobreviver a isso: remontar refaria a rodada,
 * e o dia de hoje — o único que não vem do cache — seria pago de novo a cada ida
 * e volta entre as abas.
 *
 * **Abrir a aba dispara a geração**, e o botão só aparece quando há o que
 * retentar: um "gerar" ao lado de parágrafos já gerados não teria o que fazer,
 * porque o lote lê `day_summaries` antes do provedor.
 */
export function HistorySummarySection({
  dateISOs,
  summaries,
  errors,
  skipped,
  progress,
  onRetry,
}: HistorySummarySectionProps) {
  const hasResult = summaries.length > 0 || errors.length > 0;
  const scopeNote = summaryScopeNote(dateISOs.length);
  const canRetry = errors.length > 0 || skipped.length > 0;

  return (
    <SectionCard
      title="Resumo por IA"
      // A marca do provedor de IA, a mesma da placa em Integrações: é ela que
      // liga o parágrafo à integração que o produziu. Vai no degrau de 14 da
      // escala de ícones, e não nos 20 da placa, que é caixa de ladrilho.
      leading={<LlmLogo size={14} />}
      action={
        progress ? (
          // Sem `icon`: `loading` troca o ícone pelo spinner, e o que se
          // passasse aqui nunca chegaria a desenhar.
          <Button variant="accent" size="sm" loading>
            {summaryProgressLabel(progress.done, progress.total)}
          </Button>
        ) : (
          canRetry && (
            <Button variant="accent" size="sm" onClick={onRetry} icon={<RotateCw size={14} />}>
              Tentar novamente
            </Button>
          )
        )
      }
      bodyClassName="p-3 flex flex-col gap-3"
    >
      {scopeNote && <p className="text-xs text-fg-muted">{scopeNote}</p>}

      {!hasResult && !progress && (
        <p className="text-sm text-fg-muted">Nenhum resumo para esta busca.</p>
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
  );
}
