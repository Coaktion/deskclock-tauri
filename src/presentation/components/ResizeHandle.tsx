interface ResizeHandleProps extends React.ComponentPropsWithoutRef<"div"> {
  /** Arraste em curso — mantém o divisor aceso enquanto o cursor está longe dele. */
  active?: boolean;
}

/**
 * Divisor arrastável entre dois painéis. Espalhe nele o `handleProps` do
 * `useResizablePanel`, que traz os gestos e a semântica de separador.
 *
 * **A orientação vem do `aria-orientation`**, que o `handleProps` já traz: um
 * divisor `vertical` separa painéis lado a lado e se arrasta na horizontal;
 * `horizontal` separa painéis empilhados. Ler o próprio atributo ARIA em vez de
 * aceitar uma prop própria é o que impede o desenho de discordar do gesto — não
 * existe um segundo lugar onde errar o eixo.
 *
 * **Ele é a própria borda**, não um enfeite ao lado dela: a linha de 1px é o
 * `before`, e é por isso que o `formColumnShellClass` não desenha mais
 * `border-r` — haveria linha dupla. Vale igual no eixo vertical, onde o handle
 * substitui o `border-b` da seção acima.
 *
 * **O grip é o que anuncia que a área se arrasta.** Duas barras paralelas de
 * comprimentos diferentes, centradas no divisor: sem elas o divisor é
 * indistinguível de uma borda comum, e o recurso só existe para quem por acaso
 * passa o cursor ali e vê o cursor de arraste. Elas são **desenhadas**, não um
 * ícone do Lucide — o menor ícone da biblioteca tem 15px de lado e obrigaria o
 * divisor a ser um risco grosso permanente no meio da tela, quando o que se
 * quer é um traço fino que responde ao cursor.
 *
 * **A caixa do grip usa o fundo da superfície** (`bg-canvas`, o mesmo da
 * janela) para apagar o trecho de linha que passa por trás dela. Sem o recorte
 * apareceriam três linhas em vez de duas barras.
 *
 * O gutter de 6px é largura (ou altura) de layout de verdade, não sobreposição:
 * o grip cabe nele sem invadir os painéis vizinhos. O `after` estende a área de
 * clique 2px para cada lado, chegando a 10px de alvo.
 *
 * O grupo é **nomeado** (`/rh`) pela razão registrada no `fieldStyles`:
 * `group-hover` casaria com qualquer ancestral que use `group`.
 *
 * `touch-none` é obrigatório, não estética — sem ele o navegador trata o
 * arraste como rolagem e cancela o pointer capture no primeiro movimento.
 */
export function ResizeHandle({ active = false, className = "", ...props }: ResizeHandleProps) {
  const isVertical = props["aria-orientation"] !== "horizontal";
  const barColor = active ? "bg-accent" : "bg-border group-hover/rh:bg-fg-muted";

  const lineColor = active
    ? "before:bg-accent"
    : "before:bg-border-subtle hover:before:bg-border focus-visible:before:bg-accent";

  return (
    <div
      {...props}
      className={[
        "group/rh relative shrink-0 flex items-center justify-center touch-none outline-none",
        isVertical ? "w-1.5 cursor-col-resize" : "h-1.5 w-full cursor-row-resize",
        // A linha do divisor, centrada e ocupando a extensão inteira.
        "before:absolute before:content-[''] before:transition-colors",
        isVertical
          ? "before:inset-y-0 before:left-1/2 before:-translate-x-1/2 before:w-px"
          : "before:inset-x-0 before:top-1/2 before:-translate-y-1/2 before:h-px",
        lineColor,
        // Área de clique além do traço.
        "after:absolute after:content-['']",
        isVertical ? "after:inset-y-0 after:-inset-x-0.5" : "after:inset-x-0 after:-inset-y-0.5",
        className,
      ].join(" ")}
    >
      <div
        className={`relative flex items-center gap-px bg-canvas ${
          isVertical ? "flex-row py-1" : "flex-col px-1"
        }`}
      >
        <span
          className={`rounded-full transition-colors ${barColor} ${
            isVertical ? "w-px h-2.5" : "h-px w-2.5"
          }`}
        />
        <span
          className={`rounded-full transition-colors ${barColor} ${
            isVertical ? "w-px h-4" : "h-px w-4"
          }`}
        />
      </div>
    </div>
  );
}
