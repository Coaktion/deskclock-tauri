import { describe, it, expect } from "vitest";
import { clampIntoMonitor } from "@shared/utils/windowPosition";

const MON = { position: { x: 0, y: 0 }, size: { width: 1920, height: 1080 } };
const WIN = { width: 52, height: 52 };

describe("clampIntoMonitor", () => {
  it("mantém uma posição totalmente dentro do monitor", () => {
    expect(clampIntoMonitor(MON, { x: 800, y: 400 }, WIN)).toEqual({ x: 800, y: 400 });
  });

  it("encaixa x negativo (borda esquerda) na borda do monitor", () => {
    expect(clampIntoMonitor(MON, { x: -7, y: 500 }, WIN)).toEqual({ x: 0, y: 500 });
  });

  it("encaixa a borda inferior sem cortar a janela", () => {
    // y muito abaixo → clamp para height - winH
    expect(clampIntoMonitor(MON, { x: 10, y: 5000 }, WIN)).toEqual({ x: 10, y: 1080 - 52 });
  });

  it("encaixa a borda direita", () => {
    expect(clampIntoMonitor(MON, { x: 5000, y: 10 }, WIN)).toEqual({ x: 1920 - 52, y: 10 });
  });

  it("respeita a origem de um monitor secundário deslocado", () => {
    const mon2 = { position: { x: 1920, y: 0 }, size: { width: 1280, height: 720 } };
    // ponto à esquerda da origem do monitor 2 → clamp para x da origem
    expect(clampIntoMonitor(mon2, { x: 1900, y: 100 }, WIN)).toEqual({ x: 1920, y: 100 });
    // ponto muito à direita → clamp para right - winW
    expect(clampIntoMonitor(mon2, { x: 9999, y: 100 }, WIN)).toEqual({
      x: 1920 + 1280 - 52,
      y: 100,
    });
  });

  it("não estoura quando a janela é maior que o monitor (maxX/maxY não ficam < origem)", () => {
    const tiny = { position: { x: 0, y: 0 }, size: { width: 40, height: 40 } };
    expect(clampIntoMonitor(tiny, { x: -100, y: -100 }, WIN)).toEqual({ x: 0, y: 0 });
  });
});
