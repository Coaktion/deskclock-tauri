import { createPortal } from "react-dom";
import { Zap } from "lucide-react";

import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { ActionChip, actionLabel } from "@presentation/components/ActionChip";
import { runAction, singleAction } from "@presentation/components/taskActions";
import { ClickBoundary, FilterPill, IconButton } from "@presentation/components/ui";
import { useAnchoredPanel } from "@presentation/hooks/useAnchoredPanel";

interface PlannedActionsFlyoutProps {
  actions: PlannedTaskAction[];
  /**
   * `pill` é o ⚡ com a contagem. `icon` é o glifo sozinho, do chip da barra de
   * título: 24px de altura já com quatro botões não comportam a pílula, e a
   * contagem sobrevive só no nome acessível.
   */
  variant?: "pill" | "icon";
}

/**
 * O ⚡ que **executa** em vez de só contar.
 *
 * **Ele não mora mais na linha de lista** (H1): ali a ação virou seção do menu
 * ⋯, e o que ele custava era largura do nome — era o segundo controle
 * disputando a faixa com o chip e a duração. O que sobra é a **barra de
 * título** (`variant="icon"`), que não é linha de lista: lá a tarefa em
 * execução é uma só, não há menu de linha e o glifo é o caminho mais curto até
 * a ação. O `pill` continua sendo o desenho do popup de concluídas, a última
 * lista que ainda o usa (H3).
 *
 * O painel vai para `document.body` por portal, pelo mesmo motivo do
 * `TagMultiSelect`: a lista que hospeda esta linha rola (`overflow-y-auto`), e
 * um painel `absolute` seria cortado pelo scroller. O mecanismo dos dois é o
 * `useAnchoredPanel`; daqui vem só o `closeOnScroll`, que é a diferença entre um
 * gatilho dentro de um scroller e um fora.
 */
export function PlannedActionsFlyout({ actions, variant = "pill" }: PlannedActionsFlyoutProps) {
  // A variante decide o scroller: a pílula mora em listas que rolam, o ícone na
  // barra de título, que não rola. Lá o `closeOnScroll` só fecharia o painel
  // quando a **página** por baixo rolasse — que não move o gatilho.
  const { open, setOpen, triggerRef, panelRef, panelStyle, openPanel } =
    useAnchoredPanel<HTMLSpanElement>({ closeOnScroll: variant === "pill" });

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
     * O `ClickBoundary` dá o `ref` e segura o clique, que o `FilterPill` não
     * expõe. A parada é necessária: a linha do Planejamento abre a edição ao
     * clique, e o ⚡ não pode abri-la junto.
     */
    <ClickBoundary ref={triggerRef}>
      {variant === "icon" ? (
        <IconButton
          size="sm"
          icon={<Zap size={14} />}
          title={label}
          pressed={pressed}
          onClick={trigger}
        />
      ) : (
        <FilterPill
          size="sm"
          icon={<Zap size={14} />}
          active={pressed}
          title={label}
          /* O conteúdo da pílula é a contagem, e pela regra de accname o conteúdo
             vence o `title`: sem isto o leitor de tela anuncia só "2, botão". */
          aria-label={label}
          onClick={trigger}
        >
          <span className="font-mono tabular-nums">{actions.length}</span>
        </FilterPill>
      )}

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
