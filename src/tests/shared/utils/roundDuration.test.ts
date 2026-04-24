import { describe, it, expect } from "vitest";
import { roundDuration } from "@shared/utils/roundDuration";
import type { RoundingSlot } from "@shared/utils/roundDuration";

const QH: RoundingSlot[] = [15, 30, 45, 60]; // quarto de hora
const HALF: RoundingSlot[] = [30, 60];

describe("roundDuration — tolerância 5min (exemplo principal)", () => {
  it("18min → 15min (dentro da tolerância)", () => {
    expect(roundDuration(18 * 60, QH, 5)).toBe(15 * 60);
  });

  it("20min exato → 15min (no limite da tolerância: 15+5=20)", () => {
    expect(roundDuration(20 * 60, QH, 5)).toBe(15 * 60);
  });

  it("20min 1seg → 30min (acima da tolerância)", () => {
    expect(roundDuration(20 * 60 + 1, QH, 5)).toBe(30 * 60);
  });

  it("slot exato não é alterado mesmo com tolerância", () => {
    expect(roundDuration(15 * 60, QH, 5)).toBe(15 * 60);
    expect(roundDuration(30 * 60, QH, 5)).toBe(30 * 60);
  });
});

describe("roundDuration — tolerância 0 (sempre arredonda para cima)", () => {
  it("qualquer segundo acima do slot sobe para o próximo", () => {
    expect(roundDuration(15 * 60 + 1, QH, 0)).toBe(30 * 60);
    expect(roundDuration(18 * 60, QH, 0)).toBe(30 * 60);
    expect(roundDuration(1 * 60, QH, 0)).toBe(15 * 60);
  });

  it("slot exato permanece no próprio slot", () => {
    expect(roundDuration(15 * 60, QH, 0)).toBe(15 * 60);
    expect(roundDuration(60 * 60, QH, 0)).toBe(60 * 60);
  });
});

describe("roundDuration — duração menor que o primeiro slot", () => {
  it("dentro da tolerância de 0: arredonda para cima até o primeiro slot", () => {
    // 3min, slots=[15,30], tol=0 → sobe para 15
    expect(roundDuration(3 * 60, QH, 0)).toBe(15 * 60);
  });

  it("dentro da tolerância: arredonda para 0 (nenhum slot abaixo)", () => {
    // 3min, tol=5 → lowerSnap=0, 3min ≤ 0+5=5 → 0
    expect(roundDuration(3 * 60, QH, 5)).toBe(0);
  });

  it("fora da tolerância: sobe para o primeiro slot", () => {
    // 8min, tol=5 → lowerSnap=0, 8min > 5 → sobe para 15
    expect(roundDuration(8 * 60, QH, 5)).toBe(15 * 60);
  });
});

describe("roundDuration — durações maiores que 60min (grade se repete)", () => {
  it("65min com slots QH e tol=5 → 60min (dentro da tolerância de 60+5=65)", () => {
    expect(roundDuration(65 * 60, QH, 5)).toBe(60 * 60);
  });

  it("65min com tol=0 → 75min (fora da tolerância, sobe para 60+15)", () => {
    expect(roundDuration(65 * 60, QH, 0)).toBe(75 * 60);
  });

  it("91min com HALF e tol=5 → 90min", () => {
    expect(roundDuration(91 * 60, HALF, 5)).toBe(90 * 60);
  });

  it("8h10m com QH e tol=5 → 8h15m (10 > 5 → sobe)", () => {
    expect(roundDuration((8 * 60 + 10) * 60, QH, 5)).toBe((8 * 60 + 15) * 60);
  });

  it("8h4m com QH e tol=5 → 8h (4 ≤ 5 → fica)", () => {
    expect(roundDuration((8 * 60 + 4) * 60, QH, 5)).toBe(8 * 60 * 60);
  });
});

describe("roundDuration — casos extremos", () => {
  it("duração zero retorna zero", () => {
    expect(roundDuration(0, QH, 0)).toBe(0);
    expect(roundDuration(0, QH, 5)).toBe(0);
  });

  it("lista de slots vazia retorna a duração original", () => {
    expect(roundDuration(22 * 60, [], 5)).toBe(22 * 60);
  });

  it("slot único de 60min com tol=0: segundos acima de hora cheia sobem", () => {
    expect(roundDuration(61 * 60, [60], 0)).toBe(120 * 60);
    expect(roundDuration(60 * 60, [60], 0)).toBe(60 * 60);
  });

  it("slot único de 60min com tol=10: 65min → 60min", () => {
    expect(roundDuration(65 * 60, [60], 10)).toBe(60 * 60);
  });
});
