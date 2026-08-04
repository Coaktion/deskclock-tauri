import { formColumnShellClass } from "@presentation/components/fieldStyles";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface CollapsibleFormColumnProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rótulo do que a coluna cria — aparece no cabeçalho e, de pé, na faixa. */
  label: string;
  /** Valor de `data-tour`. Fica na casca, não no formulário: recolhida, a casca continua na tela. */
  tourId?: string;
  children: React.ReactNode;
}

/**
 * Coluna de entrada que o usuário pode recolher — o formulário do Planejamento e
 * o do Lançamento Manual. Recolhida, sobra uma faixa estreita com o rótulo de
 * pé, e a lista ao lado fica com a largura inteira da tela.
 *
 * A faixa inteira é o botão de reabrir: recolhida, ela não tem outra função, e
 * um alvo de 36px é mais fácil de acertar que um ícone solto.
 *
 * O estado mora em quem chama, e não aqui, porque ele é persistido na config —
 * quem recolhe a coluna quer espaço para trabalhar, não para uma sessão só.
 */
export function CollapsibleFormColumn({
  collapsed,
  onToggle,
  label,
  tourId,
  children,
}: CollapsibleFormColumnProps) {
  if (collapsed) {
    return (
      <button
        type="button"
        data-tour={tourId}
        onClick={onToggle}
        title={`Expandir — ${label}`}
        className="w-9 shrink-0 border-r border-gray-800 flex flex-col items-center gap-3 pt-2.5 text-gray-500 hover:text-gray-200 hover:bg-gray-900/50 transition-colors"
      >
        <PanelLeftOpen size={15} className="shrink-0" />
        {/* De pé, lido de cima para baixo: virar o texto é o que permite manter
            o rótulo numa faixa dessa largura em vez de só um ícone sem nome. */}
        <span className="[writing-mode:vertical-rl] text-[11px] uppercase tracking-wide whitespace-nowrap">
          {label}
        </span>
      </button>
    );
  }

  return (
    <div data-tour={tourId} className={formColumnShellClass}>
      <div className="shrink-0 flex items-center gap-2 px-2.5 py-1.5 border-b border-gray-800">
        <span className="flex-1 text-[11px] font-medium text-gray-500 uppercase tracking-wide truncate">
          {label}
        </span>
        <button
          type="button"
          onClick={onToggle}
          title={`Recolher — ${label}`}
          className="shrink-0 text-gray-600 hover:text-gray-200 transition-colors"
        >
          <PanelLeftClose size={14} />
        </button>
      </div>
      {children}
    </div>
  );
}
