import { ArrowUpRight, FolderOpen, Globe } from "lucide-react";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { actionDestinationLabel, executeActions } from "@domain/utils/actions";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

/**
 * O que o chip escreve, em três degraus: o nome dado à ação; o **destino** por
 * extenso, quando o host é conhecido; e, só então, o rótulo cru do valor —
 * hostname na URL, nome do arquivo no caminho.
 *
 * **O degrau do meio é o que atende a ação sem nome**, que é toda a criada antes
 * de o campo existir. Ela nunca vai ganhar `label` — nomear é escrita, e o dado
 * antigo não se reescreve sozinho —, então sem esta derivação o acervo inteiro
 * continuaria escrevendo `meet.google.com` ao lado das ações novas escrevendo
 * "Meet". Deriva em tempo de desenho, e não no banco: a ação segue sem nome, e
 * gravar um nome que a pessoa não escolheu tiraria dela o "sem nome" como estado.
 */
export function actionLabel(action: PlannedTaskAction): string {
  const named = action.label?.trim();
  if (named) return named;

  if (action.type === "open_url") {
    const destination = actionDestinationLabel(action.value);
    if (destination) return destination;
    try {
      const normalized = action.value.startsWith("http") ? action.value : `https://${action.value}`;
      return new URL(normalized).hostname.replace(/^www\./, "");
    } catch {
      return action.value;
    }
  }
  const parts = action.value.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || action.value;
}

interface ActionChipProps {
  action: PlannedTaskAction;
}

export function ActionChip({ action }: ActionChipProps) {
  return (
    <button
      type="button"
      onClick={() =>
        void executeActions([action], { openUrl: openInBrowser, openPath: openInFileManager })
      }
      title={action.value}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-sm rounded-control border border-accent/25 bg-accent/5 text-accent-text hover:border-accent/50 hover:bg-accent/10 transition-colors"
    >
      {action.type === "open_url" ? (
        <Globe size={14} className="shrink-0" />
      ) : (
        <FolderOpen size={14} className="shrink-0" />
      )}
      {/* O teto existe para o **nome comprido**, não para o número de ações:
          nome escrito à mão não tem limite, e sem ele um só chip passa dos 264px
          úteis do card. Duas ações continuam quebrando a faixa em duas linhas, e
          é o que se espera. O valor inteiro fica no `title`. */}
      <span className="truncate max-w-36">{actionLabel(action)}</span>
      <ArrowUpRight size={14} className="shrink-0" />
    </button>
  );
}
