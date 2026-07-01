import { describe, it, expect } from "vitest";
import { composeLocalISO, composeMeetingEndISO } from "@domain/usecases/calendar/meetingTime";

describe("composeLocalISO", () => {
  it("compõe um instante absoluto a partir de data local + HH:MM", () => {
    // Interpretado no fuso local; comparamos convertendo de volta ao horário local.
    const iso = composeLocalISO("2026-07-01", "10:00");
    const d = new Date(iso);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // julho
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(0);
  });
});

describe("composeMeetingEndISO", () => {
  it("mantém o fim no mesmo dia quando é depois do início", () => {
    const end = composeMeetingEndISO("2026-07-01", "10:00", "10:30");
    const d = new Date(end);
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(30);
  });

  it("joga o fim para o dia seguinte quando cruza a meia-noite", () => {
    const end = composeMeetingEndISO("2026-07-01", "23:30", "00:30");
    const d = new Date(end);
    expect(d.getDate()).toBe(2);
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(30);
  });
});
