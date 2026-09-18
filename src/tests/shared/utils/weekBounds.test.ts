import { describe, it, expect, vi, afterEach } from "vitest";
import { weekBoundsISO, weekBoundsOf } from "@shared/utils/time";

const SEGUNDA = 1;
const DOMINGO = 0;

describe("weekBoundsISO delega a weekBoundsOf", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ["segunda de madrugada", new Date(2026, 8, 14, 0, 30), "2026-09-14"],
    ["quarta", new Date(2026, 8, 16, 12), "2026-09-16"],
    ["domingo à noite", new Date(2026, 8, 20, 23, 30), "2026-09-20"],
  ])("%s dá a mesma semana de segunda a domingo", (_label, agora, hoje) => {
    vi.useFakeTimers();
    vi.setSystemTime(agora);
    expect(weekBoundsISO(SEGUNDA)).toEqual(weekBoundsOf(hoje, SEGUNDA));
    expect(weekBoundsISO(SEGUNDA)).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("segunda é o próprio início e domingo fecha a semana", () => {
    expect(weekBoundsOf("2026-09-14", SEGUNDA)).toEqual({
      start: "2026-09-14",
      end: "2026-09-20",
    });
    expect(weekBoundsOf("2026-09-20", SEGUNDA)).toEqual({
      start: "2026-09-14",
      end: "2026-09-20",
    });
  });

  it("virada de ano", () => {
    expect(weekBoundsOf("2026-01-01", SEGUNDA)).toEqual({
      start: "2025-12-29",
      end: "2026-01-04",
    });
    expect(weekBoundsOf("2026-01-01", DOMINGO)).toEqual({
      start: "2025-12-28",
      end: "2026-01-03",
    });
  });

  it("com a semana no domingo, o domingo abre a semana em vez de fechá-la", () => {
    // O mesmo domingo cai nos dois lados da fronteira conforme a config: é o
    // que faz a escolha mudar o total da semana, e não só a grade do calendário.
    expect(weekBoundsOf("2026-09-20", DOMINGO)).toEqual({
      start: "2026-09-20",
      end: "2026-09-26",
    });
    expect(weekBoundsOf("2026-09-16", DOMINGO)).toEqual({
      start: "2026-09-13",
      end: "2026-09-19",
    });
  });

  it("a semana tem sete dias e contém o dia pedido, em qualquer um dos dois modos", () => {
    for (const inicio of [SEGUNDA, DOMINGO] as const) {
      for (const dia of ["2026-09-14", "2026-09-16", "2026-09-20", "2026-01-01"]) {
        const { start, end } = weekBoundsOf(dia, inicio);
        expect(start <= dia && dia <= end).toBe(true);
        expect(weekBoundsOf(start, inicio)).toEqual({ start, end });
      }
    }
  });
});
