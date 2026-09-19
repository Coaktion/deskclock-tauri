import { Play } from "lucide-react";
import { isPlayBlocked, playTitle, type PlayBlock } from "@presentation/components/playAction";
import { ClickBoundary, IconButton } from "@presentation/components/ui";

interface PlannedPlaySlotProps {
  playBlock: PlayBlock;
  onPlay: () => void;
  /**
   * O rótulo em repouso. As Entradas dizem "Iniciar com estes dados", porque o
   * ▶ delas abre uma execução nova copiando o lançamento; o bloqueio tem
   * redação própria (`playTitle`) e não muda por tela.
   */
  idleTitle?: string;
  /**
   * A coluna fica, sem o botão — a concluída e o modo de seleção. Some só o
   * conteúdo: sem a largura, o chip das vizinhas saltaria a cada conclusão.
   */
  empty?: boolean;
}

/**
 * A largura da coluna do ▶ (`IconButton size="md"` com ícone de 16), num lugar
 * só: a linha que nunca tem Play mas divide a lista com as que têm — o
 * cabeçalho de grupo das Entradas — reserva **esta** largura, ou o chip dela
 * ficaria 38 px à direita do das vizinhas.
 */
const SLOT_CLASS = "flex w-7 justify-center";

/**
 * A coluna do ▶ de uma linha de lista (`TaskRow.trailing`): largura fixa mesmo
 * vazia, porque o Play não pode andar. Bloqueado, o botão continua visível e
 * desabilitado, com o motivo no `title` — não há ícone de pausa.
 */
export function PlannedPlaySlot({
  playBlock,
  onPlay,
  idleTitle,
  empty = false,
}: PlannedPlaySlotProps) {
  if (empty) return <EmptyPlaySlot />;
  return (
    <span className={SLOT_CLASS} data-play-slot>
      <ClickBoundary>
        <IconButton
          icon={<Play size={16} fill="currentColor" />}
          title={playTitle(playBlock, idleTitle)}
          variant="primary"
          size="md"
          disabled={isPlayBlocked(playBlock)}
          onClick={onPlay}
        />
      </ClickBoundary>
    </span>
  );
}

/** A coluna do ▶ reservada, sem botão — para a linha que nunca o tem. */
export function EmptyPlaySlot() {
  return <span className={SLOT_CLASS} data-play-slot />;
}
