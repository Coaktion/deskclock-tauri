/**
 * Marca do provedor de IA, na mesma caixa quadrada dos outros logos de integração.
 *
 * **É a única integração sem marca de terceiro**, porque não é um serviço e sim
 * uma família deles — 11 presets, do Groq ao Ollama na sua própria máquina.
 * Vestir a placa com o logo de um deles diria que o DeskClock fala só com aquele.
 * O desenho é nosso e vai em `currentColor`, então acompanha modo e acento como
 * qualquer outro cromo; os logos de marca são a exceção de cor, este não precisa
 * ser.
 */
export function LlmLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="text-accent"
    >
      <path
        d="M12 2.5 13.7 8.3 19.5 10 13.7 11.7 12 17.5 10.3 11.7 4.5 10 10.3 8.3 12 2.5Z"
        fill="currentColor"
      />
      <path
        d="M18.5 15 19.2 17.3 21.5 18 19.2 18.7 18.5 21 17.8 18.7 15.5 18 17.8 17.3 18.5 15Z"
        fill="currentColor"
        opacity="0.6"
      />
    </svg>
  );
}
