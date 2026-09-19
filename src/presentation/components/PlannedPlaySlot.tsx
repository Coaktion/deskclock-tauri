import { Play } from "lucide-react";
import { isPlayBlocked, playTitle, type PlayBlock } from "@presentation/components/playAction";
import { ClickBoundary, IconButton } from "@presentation/components/ui";

interface PlannedPlaySlotProps {
  playBlock: PlayBlock;
  onPlay: () => void;
  /**
   * A coluna fica, sem o botão — a concluída e o modo de seleção. Some só o
   * conteúdo: sem a largura, o chip das vizinhas saltaria a cada conclusão.
   */
  empty?: boolean;
}

/**
 * A coluna do ▶ da linha planejada (`TaskRow.trailing`): largura fixa mesmo
 * vazia, porque o Play não pode andar. Bloqueado, o botão continua visível e
 * desabilitado, com o motivo no `title` — não há ícone de pausa.
 */
export function PlannedPlaySlot({ playBlock, onPlay, empty = false }: PlannedPlaySlotProps) {
  return (
    <span className="flex w-7 justify-center" data-play-slot>
      {!empty && (
        <ClickBoundary>
          <IconButton
            icon={<Play size={16} fill="currentColor" />}
            title={playTitle(playBlock)}
            variant="primary"
            size="md"
            disabled={isPlayBlocked(playBlock)}
            onClick={onPlay}
          />
        </ClickBoundary>
      )}
    </span>
  );
}
