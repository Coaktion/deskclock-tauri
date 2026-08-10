import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "../src/index.css";
import { CASES } from "./cases";

/**
 * Bancada visual — renderiza **um** caso, escolhido por `?case=<id>`, dentro de
 * uma caixa da largura que o mock dá a ele.
 *
 * Um caso por carregamento, e não uma galeria: a foto tem de ser do elemento
 * sozinho sobre o fundo da tela, e vizinho na mesma página muda a caixa por
 * `gap` e altura de linha.
 */
const params = new URLSearchParams(location.search);
const id = params.get("case") ?? CASES[0].id;
const found = CASES.find((c) => c.id === id);
/** `?w=` vence o valor do arquivo: quem mede a largura do mock é o script. */
const largura = Number(params.get("w")) || found?.width;

const root = createRoot(document.getElementById("bancada")!);

if (!found) {
  root.render(
    <pre style={{ color: "red", font: "12px monospace" }}>
      caso &quot;{id}&quot; não existe. Disponíveis: {CASES.map((c) => c.id).join(", ")}
    </pre>
  );
} else {
  document.title = `bancada — ${found.id}`;
  root.render(
    <StrictMode>
      {/* `bg-canvas` no corpo: no mock a linha de tarefa fica sobre o fundo da
          página, e fotografar sobre branco mudaria cada pixel de antialiasing
          do texto — o diff viraria ruído puro. */}
      <div
        className="bg-canvas"
        style={{ padding: 0, margin: 0, width: "fit-content" }}
        data-bancada-raiz
      >
        <div style={{ width: largura }} data-bancada-caso>
          {found.element}
        </div>
      </div>
    </StrictMode>
  );
}
