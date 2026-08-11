import { FORM_COLUMN_WIDTH, formColumnShellClass } from "@presentation/components/fieldStyles";
import { ResizeHandle } from "@presentation/components/ResizeHandle";
import { useResizablePanel, type NumberConfigKey } from "@presentation/hooks/useResizablePanel";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

interface CollapsibleFormColumnProps {
  collapsed: boolean;
  onToggle: () => void;
  /** Rótulo do que a coluna cria — aparece no cabeçalho e, de pé, na faixa. */
  label: string;
  /** Chave da config onde a largura arrastada fica gravada. */
  widthKey: NumberConfigKey;
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
 * Aberta, a coluna é **arrastável** pelo divisor à direita, e arrastar bem
 * abaixo do mínimo a recolhe — o mesmo destino do botão, pelo gesto que já está
 * em curso. Recolhida não há divisor: não há o que dimensionar, e a faixa toda
 * já é o botão de reabrir.
 *
 * O recolhido e a largura moram em chaves diferentes da config, e é o que
 * permite reabrir na largura de antes. Nenhum dos dois mora aqui: quem recolhe
 * ou alarga a coluna quer trabalhar assim, não por uma sessão só.
 */
export function CollapsibleFormColumn({
  collapsed,
  onToggle,
  label,
  widthKey,
  tourId,
  children,
}: CollapsibleFormColumnProps) {
  // Antes do `return` do estado recolhido: hook não pode ficar atrás de condição.
  const panel = useResizablePanel({
    key: widthKey,
    min: FORM_COLUMN_WIDTH.min,
    max: FORM_COLUMN_WIDTH.max,
    defaultSize: FORM_COLUMN_WIDTH.default,
    // Só recolhe estando aberta — e, estando aberta, alternar é recolher.
    onCollapse: collapsed ? undefined : onToggle,
  });

  if (collapsed) {
    return (
      <button
        type="button"
        data-tour={tourId}
        onClick={onToggle}
        title={`Expandir — ${label}`}
        className="w-9 shrink-0 border-r border-border-subtle flex flex-col items-center gap-3 pt-2.5 text-fg-muted hover:text-fg hover:bg-raised transition-colors"
      >
        <PanelLeftOpen size={16} className="shrink-0" />
        {/* De pé, lido de cima para baixo: virar o texto é o que permite manter
            o rótulo numa faixa dessa largura em vez de só um ícone sem nome. */}
        <span className="[writing-mode:vertical-rl] text-overline uppercase whitespace-nowrap">
          {label}
        </span>
      </button>
    );
  }

  return (
    <>
      <div data-tour={tourId} className={formColumnShellClass} style={{ width: panel.size }}>
        {/* 8/12 do spec, e o eixo x tem de ser o mesmo do corpo (`p-3`): com o
            cabeçalho em 10 o rótulo ficaria 2px para dentro dos campos. */}
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-border-subtle">
          {/* `leading-none`: com a entrelinha padrão, a caixa do texto fica mais
              alta que as letras e o rótulo desce em relação ao ícone ao lado. */}
          <span className="flex-1 text-overline leading-none uppercase text-fg-muted truncate">
            {label}
          </span>
          <button
            type="button"
            onClick={onToggle}
            title={`Recolher — ${label}`}
            className="shrink-0 text-fg-muted hover:text-fg transition-colors"
          >
            <PanelLeftClose size={14} />
          </button>
        </div>
        {children}
      </div>
      <ResizeHandle
        {...panel.handleProps}
        active={panel.isDragging}
        aria-label={`Largura da coluna — ${label}`}
        title="Arraste para redimensionar. Duplo clique volta ao padrão."
      />
    </>
  );
}
