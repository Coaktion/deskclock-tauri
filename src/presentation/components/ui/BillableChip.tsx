import { Badge } from "./Badge";

interface BillableChipProps {
  billable: boolean;
  /**
   * Ausente, o chip só informa. Presente, ele **é** o indicador clicável que a
   * §5.2 promete — o dono do clique que morava no ponto de projeto, de volta a
   * ser cor de projeto e nada mais.
   */
  onToggle?: () => void;
}

/**
 * O billable escrito. A cor sozinha não diz o que significa, e enquanto ela era
 * o único sinal — faixa à esquerda da linha, ponto colorido — a informação não
 * chegava a quem não distingue as duas, nem a quem nunca passou o cursor por
 * cima do `title`.
 */
export function BillableChip({ billable, onToggle }: BillableChipProps) {
  const chip = (
    <Badge tone={billable ? "billable" : "neutral"}>{billable ? "Billable" : "Non-billable"}</Badge>
  );

  if (!onToggle) return chip;

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
      className="shrink-0 flex rounded-chip hover:opacity-80 transition-opacity"
    >
      {chip}
    </button>
  );
}
