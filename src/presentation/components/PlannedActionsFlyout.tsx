import { createPortal } from "react-dom";
import { Zap } from "lucide-react";

import type { PlannedTaskAction } from "@domain/entities/PlannedTask";
import { executeActions } from "@domain/utils/actions";
import { ActionChip, actionLabel } from "@presentation/components/ActionChip";
import { FilterPill, IconButton } from "@presentation/components/ui";
import { useAnchoredPanel } from "@presentation/hooks/useAnchoredPanel";
import { openInBrowser, openInFileManager } from "@shared/utils/shell";

/**
 * A ação quando ela é **a** ação. Com uma só, abrir um painel para oferecer a
 * única escolha possível é um clique cobrado por nada — o gatilho executa direto.
 *
 * Mora fora do componente, e exportada, porque é a decisão que separa os dois
 * comportamentos do ⚡: enterrada no JSX ela só se verificaria abrindo a tela.
 */
export function singleAction(actions: PlannedTaskAction[]): PlannedTaskAction | null {
  return actions.length === 1 ? actions[0] : null;
}

function run(action: PlannedTaskAction) {
  void executeActions([action], { openUrl: openInBrowser, openPath: openInFileManager });
}

interface PlannedActionsFlyoutProps {
  actions: PlannedTaskAction[];
  /**
   * `pill` é o ⚡ com a contagem, das linhas. `icon` é o glifo sozinho, do chip
   * da barra de título: 24px de altura já com quatro botões não comportam a
   * pílula, e a contagem sobrevive só no nome acessível.
   */
  variant?: "pill" | "icon";
}

/**
 * O ⚡ da linha planejada, que **executa** em vez de só contar.
 *
 * Ele era rótulo dentro do subtítulo, e ali tinha dois defeitos de uma vez: não
 * levava a lugar nenhum, e morava na célula `1fr` do nome — a que encolhe quando
 * a fileira de botões abre no hover —, então sumia justamente na tarefa de nome
 * longo. No slot `badges` ele fica ao lado do chip de faturamento, que é o
 * arranjo que já mantinha o chip imóvel.
 *
 * O painel vai para `document.body` por portal, pelo mesmo motivo do
 * `TagMultiSelect`: as duas listas que hospedam esta linha rolam
 * (`overflow-y-auto`), e um painel `absolute` seria cortado pelo scroller. O
 * mecanismo dos dois é o `useAnchoredPanel`; daqui vem só o `closeOnScroll`,
 * que é a diferença entre um gatilho dentro de um scroller e um fora.
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
  const trigger = () => (only ? run(only) : open ? setOpen(false) : openPanel());
  /* Só o gatilho que **alterna** se anuncia como alternável: com uma ação ele
     dispara e volta ao mesmo estado, e um `aria-pressed` preso em "não
     pressionado" descreveria um botão que não existe. */
  const pressed = only ? undefined : open;

  return (
    /*
     * O `ref` e o `stopPropagation` moram no invólucro porque o `FilterPill` não
     * expõe nem um nem outro — o `onClick` dele não recebe o evento.
     *
     * Hoje **nenhuma** das duas linhas que hospedam o ⚡ escuta clique enquanto
     * ele existe: no Planejamento o `onClick` só aparece no modo de seleção, e
     * ali o ⚡ nem é desenhado; no popup a linha não tem `onClick` nenhum. A
     * parada é guarda, e não conserto de um caso vivo — a pílula não pode vazar
     * clique para uma linha que venha a escutar depois, e quem descobriria isso
     * seria o usuário, não o teste.
     */
    <span ref={triggerRef} className="inline-flex" onClick={(e) => e.stopPropagation()}>
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
    </span>
  );
}
