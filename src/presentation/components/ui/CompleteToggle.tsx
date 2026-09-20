import { Check } from "lucide-react";

interface CompleteToggleProps {
  completed: boolean;
  onToggle: () => void;
}

/**
 * O círculo de concluir. Ele existe porque o estado mais importante de uma
 * tarefa planejada — feita ou não — só se alterava por um botão escondido no
 * hover, com o mesmo peso de "Duplicar".
 *
 * Mede 14 px, a coluna `leading` do `TaskRow`, e é a mesma medida da caixa de
 * seleção que toma o lugar dele no modo de seleção: trocar um pelo outro não
 * move o nome.
 *
 * Concluído, o círculo enche de acento com o ✓ em `text-white` — a exceção
 * documentada de texto sobre `bg-accent`, já que não há token de texto sobre
 * acento.
 *
 * **Para a propagação do clique**: a linha em volta abre a edição ao clique, e
 * concluir não pode abri-la junto.
 */
export function CompleteToggle({ completed, onToggle }: CompleteToggleProps) {
  const title = completed ? "Marcar como pendente" : "Concluir";
  return (
    <button
      type="button"
      aria-pressed={completed}
      aria-label={title}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`shrink-0 flex h-3.5 w-3.5 cursor-pointer items-center justify-center overflow-hidden rounded-full border transition-colors ${
        completed ? "border-accent bg-accent text-white" : "border-fg-muted hover:border-accent"
      }`}
    >
      {completed && <Check size={14} strokeWidth={2.5} aria-hidden />}
    </button>
  );
}
