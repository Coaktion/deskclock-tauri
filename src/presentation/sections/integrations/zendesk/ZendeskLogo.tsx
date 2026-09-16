/**
 * Marca do Zendesk. A cor vem da classe `zendesk-logo` (`index.css`), e não do
 * `fill`: o verde-escuro da marca some sobre o canvas escuro, então cada modo
 * tem o seu tom.
 */
export function ZendeskLogoSmall({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 26 26"
      aria-hidden="true"
      className="zendesk-logo"
    >
      <path
        fill="currentColor"
        d="M12 8.2v14.5H0zM12 3c0 3.3-2.7 6-6 6S0 6.3 0 3h12zm2 19.7c0-3.3 2.7-6 6-6s6 2.7 6 6H14zm0-5.2V3h12z"
      />
    </svg>
  );
}
