/**
 * O `?` redondo que abre o tour. Vivia dentro do `PageHeader` e estava copiado,
 * caractere por caractere, nos cabeçalhos dos cards de Google, Zendesk e
 * Clockify — quatro cópias de um botão de 20px, que é justamente o tamanho em
 * que um pixel de diferença no raio ou na borda salta aos olhos.
 *
 * Não é um `IconButton`: o glifo é texto, não ícone, e a caixa é um círculo de
 * medida fixa, não o padding de uma escala.
 */
export function TourButton({
  onClick,
  label = "Ver tour da página",
}: {
  onClick: () => void;
  /** O que o tour cobre — a página, ou a integração daquele card. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-5 h-5 shrink-0 rounded-full border border-border text-fg-muted hover:border-fg-muted hover:text-fg-secondary transition-colors text-xs font-medium flex items-center justify-center"
    >
      ?
    </button>
  );
}
