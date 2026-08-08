import { useId, type KeyboardEvent, type ReactNode } from "react";
import { X } from "lucide-react";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { IconButton } from "./IconButton";

/**
 * Casca de modal. Havia quatro véus diferentes e cinco larguras em 19 modais —
 * dois deles com desfoque, que em janela de 1100 px custa quadro e não separa
 * nada que a opacidade já não separe.
 *
 * O véu é `bg-canvas/82`, e o token importa: escrito como preto translúcido ele
 * fica igual nos dois modos, escurecendo o modo claro em vez de recuá-lo.
 */
export type ModalSize = "sm" | "md" | "lg" | "xl";

/**
 * As quatro medidas do design. Ficam em px porque são largura de janela, não
 * ritmo de espaçamento — a mesma escolha das colunas de 720 px de Dados e
 * Configurações.
 */
const SIZE: Record<ModalSize, string> = {
  sm: "max-w-[360px]",
  md: "max-w-[460px]",
  lg: "max-w-[720px]",
  xl: "max-w-[900px]",
};

interface ModalProps {
  /**
   * Nome acessível do diálogo — vai no `aria-labelledby`, então aceita nó (o
   * ponto do workspace antes do texto) mas nunca deve vir vazio.
   */
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  /** Frase abaixo do título, para a consequência que o título não cabe. */
  description?: ReactNode;
  /**
   * Faixa fixa entre o cabeçalho e o corpo — o recorte de período do envio, as
   * abas da exportação. Fica fora do corpo porque não deve rolar junto com a
   * lista que ela filtra.
   */
  toolbar?: ReactNode;
  /**
   * Ações, encostadas à direita. A secundária vai sem casca (`ghost`): dois
   * botões cheios lado a lado não dizem qual é a ação principal.
   */
  footer?: ReactNode;
  /**
   * Canto esquerdo do rodapé — "Todas" / "Nenhuma" e afins. Não é ação sobre o
   * diálogo, é controle da lista, e por isso não disputa lugar com o `footer`.
   */
  footerStart?: ReactNode;
  /**
   * Faixa fixa logo acima das ações — o aviso de reenvio, o resultado do envio.
   * Dentro do corpo, ela rolaria para fora justamente quando descreve o que
   * acabou de acontecer.
   */
  notice?: ReactNode;
  /**
   * Corpo até onde a janela deixar, em vez do teto de 60vh do design. É o que
   * as listas longas pedem — envio, importação, perfis de exportação —, e o
   * limite passa a ser a própria janela menos a margem do véu, sem medida nova
   * inventada no caminho.
   */
  tall?: boolean;
  /**
   * O `useSubmitOnEnter` de quem chama. Fica no painel, não no corpo, para
   * cobrir também os campos que morem no cabeçalho ou no rodapé (§8.2).
   */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * Substitui o arranjo do corpo — não se soma a ele. Duas classes de `gap` na
   * mesma string dependeriam da ordem em que o Tailwind as emite, que não é a
   * ordem em que foram escritas.
   */
  bodyClassName?: string;
}

export function Modal({
  title,
  onClose,
  children,
  size = "md",
  description,
  toolbar,
  footer,
  footerStart,
  notice,
  tall = false,
  onKeyDown,
  bodyClassName = "flex flex-col gap-3",
}: ModalProps) {
  const titleId = useId();
  useEscapeToClose(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/82">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className={`w-full ${SIZE[size]} ${tall ? "max-h-full" : ""} flex flex-col bg-surface border border-border-subtle rounded-card shadow-2xl`}
      >
        {/* 48 px de mínimo, não de altura: com descrição o cabeçalho tem duas
            linhas, e travá-lo cortaria a segunda. */}
        <div className="shrink-0 flex items-center justify-between gap-3 min-h-12 px-5 py-2.5 border-b border-border-subtle">
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-sm font-semibold text-fg">
              {title}
            </h2>
            {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
          </div>
          <IconButton
            icon={<X size={16} />}
            title="Fechar"
            variant="neutral"
            size="sm"
            onClick={onClose}
            className="-mr-1"
          />
        </div>

        {toolbar && (
          <div className="shrink-0 px-5 py-2.5 border-b border-border-subtle">{toolbar}</div>
        )}

        <div
          className={`min-h-0 overflow-y-auto p-5 ${tall ? "flex-1" : "max-h-[60vh]"} ${bodyClassName}`}
        >
          {children}
        </div>

        {notice && <div className="shrink-0 px-5 pb-2 flex flex-col gap-2">{notice}</div>}

        {(footer || footerStart) && (
          <div className="shrink-0 flex items-center gap-2 min-h-13 px-5 py-2.5 border-t border-border-subtle">
            {footerStart}
            {/* Empurra as ações para a direita mesmo com o canto esquerdo
                ocupado — `justify-end` sozinho colaria os dois grupos. */}
            <div className="flex-1" />
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
