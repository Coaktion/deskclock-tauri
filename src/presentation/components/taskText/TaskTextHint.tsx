import { Sparkles } from "lucide-react";

interface TaskTextHintProps {
  /** A linha de `formatTaskFieldInstruction`; vazia, o componente não desenha nada. */
  instruction: string;
  /** Posição no container — o espaçamento é de quem hospeda. */
  className?: string;
}

/**
 * A instrução junto do campo de texto da tarefa: os campos que ela pede, na
 * ordem em que se digitam, e um exemplo do catálogo. É dica que se lê, então é
 * `caption`.
 */
export function TaskTextHint({ instruction, className = "" }: TaskTextHintProps) {
  if (!instruction) return null;
  return (
    <p className={`flex items-start gap-1.5 text-xs text-fg-muted ${className}`}>
      {/* O mesmo ícone do "Iniciar com IA": diz de onde vem a leitura do texto. */}
      <Sparkles size={12} className="shrink-0 mt-0.5" aria-hidden />
      <span>{instruction}</span>
    </p>
  );
}
