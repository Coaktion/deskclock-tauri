/**
 * Marca do Google Planilhas: a folha verde com a dobra no canto e a tabela
 * branca. Mesma caixa quadrada dos outros logos de integração, para alinhar na
 * placa do rail e no cabeçalho das sub-seções.
 *
 * A folha é mais alta que larga, então ocupa a altura toda da caixa e fica
 * centrada na largura — como o ícone oficial, que não é quadrado.
 */
export function GoogleSheetsLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14.5 1h-9A1.5 1.5 0 0 0 4 2.5v19A1.5 1.5 0 0 0 5.5 23h13a1.5 1.5 0 0 0 1.5-1.5v-15z"
        fill="#0F9D58"
      />
      <path d="M14.5 1v4A1.5 1.5 0 0 0 16 6.5h4z" fill="#87CEAC" />
      <path
        d="M7 10h10v9.6H7zm1.2 1.2v1.6h2v-1.6zm3.2 0v1.6h4.4v-1.6zm-3.2 2.8v1.6h2V14zm3.2 0v1.6h4.4V14zm-3.2 2.8v1.6h2v-1.6zm3.2 0v1.6h4.4v-1.6z"
        fill="#FFFFFF"
        fillRule="evenodd"
      />
    </svg>
  );
}
