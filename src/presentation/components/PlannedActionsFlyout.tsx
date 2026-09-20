import { createPortal } from "react-dom";
import { Zap } from "lucide-react";

import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { ActionChip, actionLabel } from "@presentation/components/ActionChip";
import { runAction, singleAction } from "@presentation/components/taskActions";
import { ClickBoundary, IconButton } from "@presentation/components/ui";
import { useAnchoredPanel } from "@presentation/hooks/useAnchoredPanel";

interface PlannedActionsFlyoutProps {
  actions: PlannedTaskAction[];
}

/**
 * O ⚡ que **executa** em vez de só contar.
 *
 * **Ele não mora mais na linha de lista** (H1): ali a ação virou seção do menu
 * ⋯, e o que ele custava era largura do nome — era o segundo controle
 * disputando a faixa com o chip e a duração. O que sobra é a **barra de
 * título**, que não é linha de lista: lá a tarefa em execução é uma só, não há
 * menu de linha e o glifo é o caminho mais curto até a ação. Com a H3 ele saiu
 * também das concluídas do popup, a última lista que o tinha, e com ela morreu
 * a variante `pill` — o ⚡ com a contagem, que não tem mais onde aparecer.
 *
 * O painel vai para `document.body` por portal, pelo mesmo motivo do
 * `TagMultiSelect`: o gatilho pode ficar dentro de um contêiner que corta, e um
 * painel `absolute` seria recortado por ele. O mecanismo dos dois é o
 * `useAnchoredPanel`.
 */
export function PlannedActionsFlyout({ actions }: PlannedActionsFlyoutProps) {
  // A barra de título não rola, então o `closeOnScroll` só fecharia o painel
  // quando a **página** por baixo rolasse — que não move o gatilho.
  const { open, setOpen, triggerRef, panelRef, panelStyle, openPanel } =
    useAnchoredPanel<HTMLSpanElement>({ closeOnScroll: false });

  if (actions.length === 0) return null;

  const only = singleAction(actions);
  const label = only ? `Abrir ${actionLabel(only)}` : `Abrir uma das ${actions.length} ações`;
  const trigger = () => (only ? runAction(only) : open ? setOpen(false) : openPanel());
  /* Só o gatilho que **alterna** se anuncia como alternável: com uma ação ele
     dispara e volta ao mesmo estado, e um `aria-pressed` preso em "não
     pressionado" descreveria um botão que não existe. */
  const pressed = only ? undefined : open;

  return (
    /*
     * O `ClickBoundary` dá o `ref` do gatilho — que o `IconButton` não expõe —
     * e segura o clique, para o ⚡ não acionar também o que estiver em volta.
     */
    <ClickBoundary ref={triggerRef}>
      <IconButton
        size="sm"
        icon={<Zap size={14} />}
        title={label}
        pressed={pressed}
        onClick={trigger}
      />

      {open &&
        createPortal(
          <div
            ref={panelRef}
            style={panelStyle}
            /* Escolher fecha. O clique no chip é **dentro** do painel, então o
               handler de clique-fora não o alcança, e sem isto o painel fica
               pendurado sobre a lista enquanto o navegador abre por cima. O
               handler é do painel, e não de cada chip, porque escolher é a
               única coisa que se faz aqui dentro. */
            onClick={() => setOpen(false)}
            className="z-[9999] flex max-w-64 flex-wrap gap-1.5 rounded-control border border-border bg-raised p-2 shadow-(--shadow-overlay)"
          >
            {actions.map((action, i) => (
              <ActionChip key={i} action={action} />
            ))}
          </div>,
          document.body
        )}
    </ClickBoundary>
  );
}
