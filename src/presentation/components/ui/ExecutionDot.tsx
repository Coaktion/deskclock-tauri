/** Como a execução se realça onde ela aparece: em curso ou parada no meio. */
export type RowExecution = "running" | "paused";

interface ExecutionDotProps {
  execution: RowExecution;
}

/**
 * O ponto de 6px que diz que aquilo é a execução em curso — a linha da lista, o
 * card do popup, o chip da barra de título.
 *
 * Ele é primitivo porque estava escrito em três lugares, e os três já divergiam:
 * dois pulsavam e um não, dois anunciavam o estado e um era mudo, e a redação do
 * `title` tinha duas versões ("Em execução" e "Rodando") para o mesmo estado.
 * Nenhuma dessas diferenças era decisão de ninguém.
 *
 * **O pulso é só de quem está rodando**: pausada e em execução pintadas do mesmo
 * jeito seriam um estado só, e o que distingue as duas é justamente o que a
 * parada não faz. E o `title` não é acabamento — sem texto ao lado, é a única
 * coisa que anuncia o estado a quem não vê a cor.
 */
export function ExecutionDot({ execution }: ExecutionDotProps) {
  const running = execution === "running";
  return (
    <span
      title={running ? "Em execução" : "Pausada"}
      className={`shrink-0 w-1.5 h-1.5 rounded-full ${
        running ? "animate-pulse bg-accent" : "bg-paused"
      }`}
    />
  );
}
