import { describe, it, expect } from "vitest";
import {
  shouldDiscardTask,
  computeRoundedDuration,
  computeRoundedStop,
} from "@domain/utils/taskStopRules";

describe("shouldDiscardTask", () => {
  it("descarta tarefa com menos de 60s quando regra ativa", () => {
    expect(shouldDiscardTask(59, true)).toBe(true);
  });

  it("não descarta tarefa com exatamente 60s", () => {
    expect(shouldDiscardTask(60, true)).toBe(false);
  });

  it("não descarta tarefa com mais de 60s", () => {
    expect(shouldDiscardTask(120, true)).toBe(false);
  });

  it("não descarta quando regra desativada, mesmo com duração < 60s", () => {
    expect(shouldDiscardTask(30, false)).toBe(false);
  });

  it("não descarta duração zero quando regra desativada", () => {
    expect(shouldDiscardTask(0, false)).toBe(false);
  });

  it("descarta duração zero quando regra ativa", () => {
    expect(shouldDiscardTask(0, true)).toBe(true);
  });
});

describe("computeRoundedDuration", () => {
  it("retorna null quando arredondamento desativado", () => {
    expect(computeRoundedDuration(150, false, [15], 0)).toBeNull();
  });

  it("retorna null quando duração é zero", () => {
    expect(computeRoundedDuration(0, true, [15], 0)).toBeNull();
  });

  it("retorna null quando duração já cai exatamente no slot", () => {
    // 15 minutos exatos → nenhuma alteração
    expect(computeRoundedDuration(900, true, [15], 0)).toBeNull();
  });

  it("retorna duração arredondada quando difere da original", () => {
    // 16 minutos (960s) com slot=15, tolerância=0 → sobe para 30min (1800s)
    const result = computeRoundedDuration(960, true, [15, 30], 0);
    expect(result).toBe(1800);
  });

  it("permanece no slot inferior dentro da tolerância", () => {
    // 16 minutos (960s), slot=15, tolerância=2min → fica em 900s
    const result = computeRoundedDuration(960, true, [15, 30], 2);
    expect(result).toBe(900);
  });

  it("retorna null quando slots vazios", () => {
    expect(computeRoundedDuration(500, true, [], 0)).toBeNull();
  });
});

describe("computeRoundedStop", () => {
  const START = "2026-08-11T13:00:00.000Z";

  it("grava o fim que fecha a conta com a duração arredondada", () => {
    // parada real 13:41 (2460s), slots de 15 em 15 → sobe para 45min
    expect(computeRoundedStop(START, 2460, true, [15, 30, 45, 60], 0)).toEqual({
      durationSeconds: 2700,
      endTime: "2026-08-11T13:45:00.000Z",
    });
  });

  it("o fim recua quando o arredondamento desce para o slot inferior", () => {
    // 16min com tolerância de 2min → fica em 15min, e o fim vem junto
    expect(computeRoundedStop(START, 960, true, [15, 30], 2)).toEqual({
      durationSeconds: 900,
      endTime: "2026-08-11T13:15:00.000Z",
    });
  });

  it("retorna null quando o arredondamento está desativado", () => {
    expect(computeRoundedStop(START, 2460, false, [15], 0)).toBeNull();
  });

  it("retorna null quando a duração já cai no slot — nada a reescrever", () => {
    expect(computeRoundedStop(START, 900, true, [15], 0)).toBeNull();
  });

  it("retorna null quando a duração é zero", () => {
    expect(computeRoundedStop(START, 0, true, [15], 0)).toBeNull();
  });
});
