export function MondayLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#1F2430" />
      <rect x="6" y="19" width="4.5" height="4.5" rx="2.25" fill="#FF3D57" />
      <rect x="12.5" y="9" width="4.5" height="14.5" rx="2.25" fill="#FFCB00" />
      <rect x="19" y="9" width="4.5" height="14.5" rx="2.25" fill="#00D2D2" />
    </svg>
  );
}
