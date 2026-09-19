export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Folga entre o gatilho e o menu. */
const GAP = 4;
/** Distância mínima da borda da janela. */
const EDGE = 4;

/**
 * Onde o menu cabe, nas três formas de ancorar. O gatilho é o ⋯ no fim da
 * linha, então o menu nasce com a borda direita alinhada à dele e cresce para a
 * esquerda, sobre a linha; do ponto, nasce no cursor e cresce para a direita,
 * como o menu de contexto do sistema; do `side` — o submenu —, nasce **ao lado**
 * do item pai, alinhado ao topo dele. Sem espaço, cada eixo vira para o outro
 * lado, e o `clamp` final é a rede para a janela menor que o próprio menu.
 */
export function placeMenu(
  anchor: { rect: Box } | { point: { x: number; y: number } } | { side: Box },
  size: { width: number; height: number },
  viewport: { width: number; height: number }
): { left: number; top: number } {
  let left: number;
  let top: number;
  if ("side" in anchor) {
    const r = anchor.side;
    left =
      r.right + GAP + size.width > viewport.width - EDGE
        ? r.left - GAP - size.width
        : r.right + GAP;
    // O submenu desce a partir do topo do item; faltando altura, ele sobe pelo
    // rodapé do item, e não pelo topo — assim ele nunca cobre o item que o abriu.
    top = r.top + size.height > viewport.height - EDGE ? r.bottom - size.height : r.top;
  } else if ("rect" in anchor) {
    const r = anchor.rect;
    left = r.right - size.width < EDGE ? r.left : r.right - size.width;
    top =
      r.bottom + GAP + size.height > viewport.height - EDGE
        ? r.top - GAP - size.height
        : r.bottom + GAP;
  } else {
    const { x, y } = anchor.point;
    left = x + size.width > viewport.width - EDGE ? x - size.width : x;
    top = y + size.height > viewport.height - EDGE ? y - size.height : y;
  }
  const clamp = (v: number, max: number) => Math.max(EDGE, Math.min(v, max - EDGE));
  return {
    left: clamp(left, viewport.width - size.width),
    top: clamp(top, viewport.height - size.height),
  };
}
