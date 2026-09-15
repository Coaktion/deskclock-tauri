import { describe, it, expect, vi, afterEach } from "vitest";
import { weekBoundsISO, weekBoundsOf } from "@shared/utils/time";

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
    expect(weekBoundsISO()).toEqual(weekBoundsOf(hoje));
    expect(weekBoundsISO()).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("segunda é o próprio início e domingo fecha a semana", () => {
    expect(weekBoundsOf("2026-09-14")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
    expect(weekBoundsOf("2026-09-20")).toEqual({ start: "2026-09-14", end: "2026-09-20" });
  });

  it("virada de ano", () => {
    expect(weekBoundsOf("2026-01-01")).toEqual({ start: "2025-12-29", end: "2026-01-04" });
  });
});
