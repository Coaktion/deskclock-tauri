import { Badge } from "./Badge";

interface BillableChipProps {
  billable: boolean;
  /**
   * Obrigatório, e é a trava: o chip **é** o controle do faturamento, nunca um
   * rótulo. Enquanto ele foi opcional, quatro listas o desenhavam mudo — e não
   * havia nada na tela separando o chip que alterna do que só informa, então
   * descobrir qual era qual dependia de clicar. Chip que só rotula é `Badge`.
   */
  onToggle: () => void;
}

/**
 * O billable escrito. A cor sozinha não diz o que significa, e enquanto ela era
 * o único sinal — faixa à esquerda da linha, ponto colorido — a informação não
 * chegava a quem não distingue as duas, nem a quem nunca passou o cursor por
 * cima do `title`.
 */
export function BillableChip({ billable, onToggle }: BillableChipProps) {
  return (
    <button
      type="button"
      // A linha em volta pode ser clicável (selecionar, expandir): sem isto,
      // alternar o faturamento também a acionaria.
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={billable ? "Billable — clique para alterar" : "Non-billable — clique para alterar"}
      className="shrink-0 flex rounded-full cursor-pointer hover:opacity-80 transition-opacity"
    >
      <Badge tone={billable ? "billable" : "neutral"}>
        {billable ? "Billable" : "Non-billable"}
      </Badge>
    </button>
  );
}
