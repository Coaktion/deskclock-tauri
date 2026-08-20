import { Trash2 } from "lucide-react";
import { Button } from "@presentation/components/ui";
import { selectionBoxClass } from "./selectionStyles";

/**
 * A seleção múltipla das listas de Dados mora no **cabeçalho do cartão**, e não
 * numa faixa própria dentro dele (spec `1/1/1/0/1/0` da tela 3c): eram duas
 * faixas empilhadas onde o design tem uma. As duas metades entram em encaixes
 * que o `SectionCard` já tem — a caixa em `leading`, o rótulo e o botão em
 * `action` —, e é por isso que são dois componentes e não um.
 */

interface SelectAllBoxProps {
  /** Amarra a caixa ao rótulo do outro lado da faixa, que continua clicável. */
  id: string;
  allSelected: boolean;
  /** Nem tudo, nem nada: a caixa mostra o traço do estado parcial. */
  partial: boolean;
  onToggle: () => void;
  title: string;
}

export function SelectAllBox({ id, allSelected, partial, onToggle, title }: SelectAllBoxProps) {
  return (
    <input
      id={id}
      type="checkbox"
      checked={allSelected}
      // Seleção parcial: traço em vez de vazio, senão o rótulo diz "3 itens
      // selecionados" com a caixa desmarcada.
      ref={(el) => {
        if (el) el.indeterminate = partial;
      }}
      onChange={onToggle}
      title={title}
      className={selectionBoxClass}
    />
  );
}

interface SelectionActionsProps {
  /** O mesmo `id` da caixa: é o que mantém o rótulo clicável a meia faixa dela. */
  boxId: string;
  count: number;
  onDelete: () => void;
}

export function SelectionActions({ boxId, count, onDelete }: SelectionActionsProps) {
  const hasSelection = count > 0;

  return (
    <div className="flex items-center gap-2">
      {/* Sem seleção, a faixa não escreve nada: a caixa do `leading` já é o
          "selecionar todos", e o rótulo ao lado dela repetia o mesmo comando. */}
      {hasSelection && (
        <label htmlFor={boxId} className="cursor-pointer select-none text-fg-muted">
          {`${count} ${count === 1 ? "item selecionado" : "itens selecionados"}`}
        </label>
      )}

      {/* Sempre no fluxo, invisível sem seleção: mostrar e esconder mexeria na
          faixa a cada clique. */}
      <Button
        variant="danger"
        onClick={onDelete}
        icon={<Trash2 size={14} />}
        className={hasSelection ? "" : "invisible pointer-events-none"}
      >
        Excluir selecionados
      </Button>
    </div>
  );
}
