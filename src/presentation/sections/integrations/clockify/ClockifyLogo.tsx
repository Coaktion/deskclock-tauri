export function ClockifyLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="32" height="32" rx="8" fill="#03A9F4" />
      <path
        d="M16 7C11.029 7 7 11.029 7 16C7 20.971 11.029 25 16 25C20.971 25 25 20.971 25 16C25 11.029 20.971 7 16 7ZM16 23C12.134 23 9 19.866 9 16C9 12.134 12.134 9 16 9C19.866 9 23 12.134 23 16C23 19.866 19.866 23 16 23Z"
        fill="white"
      />
      <path d="M17 11.5H15V16.414L18.293 19.707L19.707 18.293L17 15.586V11.5Z" fill="white" />
    </svg>
  );
}
