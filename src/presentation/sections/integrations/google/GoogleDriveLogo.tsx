import { useSvgIdPrefix } from "./useSvgIdPrefix";

/**
 * Marca do Google Drive no desenho de 2026 (o triângulo arredondado, em verde,
 * amarelo e azul com gradiente), copiada do SVG oficial servido pelo Google em
 * `www.gstatic.com/images/branding/productlogos/drive_2026/v2/web/192px.svg`.
 *
 * O `viewBox` recorta a folga do original em volta da arte, numa caixa quadrada
 * como a dos outros logos de integração.
 */
export function GoogleDriveLogo({ size = 20 }: { size?: number }) {
  const id = useSvgIdPrefix();

  return (
    <svg
      width={size}
      height={size}
      viewBox="12 11 168 168"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <mask
        id={`${id}-m`}
        width="168"
        height="154"
        x="12"
        y="18"
        maskUnits="userSpaceOnUse"
        style={{ maskType: "alpha" }}
      >
        <path
          fill="#b43333"
          d="M63.09 37c14.626-25.333 51.193-25.334 65.819 0l45.033 78c14.626 25.334-3.657 57.001-32.91 57.001H50.967c-29.253 0-47.536-31.667-32.91-57.001z"
        />
      </mask>
      <g mask={`url(#${id}-m)`}>
        <path fill={`url(#${id}-y)`} d="M206.905 172.02h-91.888l-19.015-32.934 45.944-79.578z" />
        <path
          fill={`url(#${id}-b)`}
          d="M-14.919 172.006 50.04 59.494v.002L31.032 92.422h38.02L115 172.004l-129.918.001z"
        />
        <path fill={`url(#${id}-g)`} d="M96.007-20.085 141.954 59.5l-19.011 32.928H31.048z" />
      </g>
      <defs>
        <linearGradient
          id={`${id}-y`}
          x1="193.6"
          x2="103.09"
          y1="165.6"
          y2="111.21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".09" stopColor="#ffe921" />
          <stop offset="1" stopColor="#fec700" />
        </linearGradient>
        <linearGradient
          id={`${id}-b`}
          x1="114.4"
          x2="15.53"
          y1="181.61"
          y2="121.8"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".15" stopColor="#a9a8ff" />
          <stop offset=".33" stopColor="#6d97ff" />
          <stop offset=".48" stopColor="#3186ff" />
        </linearGradient>
        <linearGradient
          id={`${id}-g`}
          x1="128.88"
          x2="28.7"
          y1="37.88"
          y2="84.64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset=".55" stopColor="#0ebc5f" />
          <stop offset=".85" stopColor="#78c9ff" />
        </linearGradient>
      </defs>
    </svg>
  );
}
