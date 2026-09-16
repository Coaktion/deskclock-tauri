import { useSvgIdPrefix } from "./useSvgIdPrefix";

/**
 * Marca do Google Planilhas no desenho de 2026 (a folha deitada, com gradiente),
 * copiada do SVG oficial servido pelo Google em
 * `www.gstatic.com/images/branding/productlogos/sheets_2026q3/v1/web/192px.svg`.
 *
 * A arte é mais larga que alta: o `viewBox` recorta a folga do original na
 * largura e mantém a caixa quadrada dos outros logos de integração, então a
 * folha ocupa a largura toda e fica centrada na altura — sem distorcer.
 */
export function GoogleSheetsLogo({ size = 20 }: { size?: number }) {
  const id = useSvgIdPrefix();

  return (
    <svg
      width={size}
      height={size}
      viewBox="7.96 8 176 176"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#009954"
        d="M183.96 117.4c0 8.94 0 13.41-1.4 16.96a20 20 0 0 1-11.23 11.24c-3.55 1.4-8.02 1.4-16.97 1.4h-60.8c-8.94 0-13.41 0-16.96-1.4a20 20 0 0 1-11.23-11.24c-1.4-3.55-1.4-8.02-1.4-16.96V74.6c0-8.94 0-13.42 1.4-16.96A20 20 0 0 1 76.6 46.4C80.15 45 84.62 45 93.56 45h60.8c8.95 0 13.42 0 16.97 1.4a20 20 0 0 1 11.23 11.24c1.4 3.54 1.4 8.02 1.4 16.96z"
      />
      <mask
        id={`${id}-m`}
        width="161"
        height="128"
        x="7"
        y="32"
        maskUnits="userSpaceOnUse"
        style={{ maskType: "alpha" }}
      >
        <path
          fill="#0ebc5f"
          d="M167.96 130.4c0 8.94 0 13.41-1.4 16.96a20 20 0 0 1-11.23 11.24c-3.55 1.4-8.02 1.4-16.97 1.4H37.56c-8.94 0-13.41 0-16.96-1.4a20 20 0 0 1-11.23-11.24c-1.4-3.55-1.4-8.02-1.4-16.96V61.6c0-8.94 0-13.42 1.4-16.96A20 20 0 0 1 20.6 33.4C24.15 32 28.62 32 37.56 32h100.8c8.95 0 13.42 0 16.97 1.4a20 20 0 0 1 11.23 11.24c1.4 3.54 1.4 8.02 1.4 16.96z"
        />
      </mask>
      <g mask={`url(#${id}-m)`}>
        <path fill="#0ebc5f" d="M167.96 160h-160V32h160z" />
        <g filter={`url(#${id}-f)`}>
          <path
            fill={`url(#${id}-g)`}
            d="M183.96 65a20 20 0 0 0-20-20h-104a20 20 0 0 0-20 20v62a20 20 0 0 0 20 20h104a20 20 0 0 0 20-20z"
          />
        </g>
      </g>
      <path
        fill="#fff"
        d="M47.96 122a6 6 0 0 1-6-6V77h-14a6 6 0 0 1 0-12h14V52a6 6 0 0 1 12 0v13h58a6 6 0 1 1 0 12h-58v39a6 6 0 0 1-6 6"
      />
      <defs>
        <linearGradient
          id={`${id}-g`}
          x1="61.73"
          x2="163.21"
          y1="88.31"
          y2="88.31"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0ebc5f" />
          <stop offset=".95" stopColor="#78c9ff" />
        </linearGradient>
        <filter
          id={`${id}-f`}
          width="168"
          height="126"
          x="27.96"
          y="33"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feGaussianBlur stdDeviation="6" />
        </filter>
      </defs>
    </svg>
  );
}
