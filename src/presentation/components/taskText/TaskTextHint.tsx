interface TaskTextHintProps {
  /** A linha de `formatTaskFieldInstruction`; vazia, o componente não desenha nada. */
  instruction: string;
  /** Posição no container — o espaçamento é de quem hospeda. */
  className?: string;
}

/**
 * A instrução acima do campo de texto da tarefa: os campos que ela pede, cada
 * um com a sigla e um exemplo do catálogo. É dica que se lê, então é `caption`.
 */
export function TaskTextHint({ instruction, className = "" }: TaskTextHintProps) {
  if (!instruction) return null;
  return <p className={`text-xs text-fg-muted ${className}`}>{instruction}</p>;
}
