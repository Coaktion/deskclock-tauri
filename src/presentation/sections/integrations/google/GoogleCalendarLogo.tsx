/**
 * Marca do Google Agenda: a folha com o "31", emoldurada pelas quatro cores do
 * Google. Mesma caixa quadrada dos outros logos de integração, para alinhar na
 * placa do rail e no cabeçalho das sub-seções.
 *
 * O "31" é traço, e não `<text>`: texto em SVG depende da fonte instalada, e o
 * glifo sairia diferente em cada sistema. Os traços são grossos de propósito,
 * para o número continuar legível no degrau de 14 px.
 */
export function GoogleCalendarLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M18.316 5.684H5.684v12.632h12.632z" fill="#FFFFFF" />
      <path d="M18.316 24 24 18.316h-5.684z" fill="#EA4335" />
      <path d="M24 5.684h-5.684v12.632H24z" fill="#FBBC04" />
      <path d="M18.316 18.316H5.684V24h12.632z" fill="#34A853" />
      <path d="M0 18.316v3.789A1.895 1.895 0 0 0 1.895 24h3.789v-5.684z" fill="#188038" />
      <path d="M24 5.684V1.895A1.895 1.895 0 0 0 22.105 0h-3.789v5.684z" fill="#1967D2" />
      <path
        d="M18.316 0H1.895A1.895 1.895 0 0 0 0 1.895v16.421h5.684V5.684h12.632z"
        fill="#4285F4"
      />
      <path
        d="M7.6 9.3Q8.2 8.4 9.3 8.4q1.6 0 1.6 1.5t-1.7 1.5q1.9 0 1.9 1.7t-1.8 1.7q-1.3 0-1.9-1M13.4 9.6l1.8-1.2V15"
        stroke="#4285F4"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
