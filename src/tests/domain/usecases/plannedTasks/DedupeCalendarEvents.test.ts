import {
  dedupeCalendarEvents,
  type CalendarDedupeEvent,
} from "@domain/usecases/plannedTasks/DedupeCalendarEvents";
import { describe, expect, it } from "vitest";

function evt(overrides: Partial<CalendarDedupeEvent> & { id: string }): CalendarDedupeEvent {
  return {
    title: "Aktie Now - Daily",
    startTime: "09:30",
    endTime: "10:00",
    isRecurring: true,
    recurringDays: [1, 2, 3, 4, 5],
    ...overrides,
  };
}

describe("dedupeCalendarEvents", () => {
  it("colapsa séries diferentes do Google que descrevem a mesma reunião", () => {
    // O caso real: a mesma daily chegou como três séries, cada uma com o seu
    // `recurringEventId`, mesmo nome e mesmo horário.
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "a" }),
      evt({ id: "b" }),
      evt({ id: "c" }),
    ]);

    expect([...dedupedIds]).toEqual(["b", "c"]);
  });

  it("mantém o primeiro evento de cada chave", () => {
    const { dedupedIds } = dedupeCalendarEvents([evt({ id: "a" }), evt({ id: "b" })]);

    expect(dedupedIds.has("a")).toBe(false);
  });

  it("separa reuniões de mesmo nome em horários diferentes", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "manha", startTime: "09:30", endTime: "10:00" }),
      evt({ id: "tarde", startTime: "16:00", endTime: "16:30" }),
    ]);

    expect(dedupedIds.size).toBe(0);
  });

  it("separa reuniões de mesmo início e fins diferentes", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "curta", endTime: "10:00" }),
      evt({ id: "longa", endTime: "11:00" }),
    ]);

    expect(dedupedIds.size).toBe(0);
  });

  it("compara o nome aparado e sem caixa, como o chip 'já existe'", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "a", title: "Aktie Now - Daily" }),
      evt({ id: "b", title: "  aktie now - DAILY " }),
    ]);

    expect([...dedupedIds]).toEqual(["b"]);
  });

  it("não toca em evento marcado como data específica", () => {
    // Ali cada dia é uma tarefa: colapsar perderia um dos dias.
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "seg", isRecurring: false }),
      evt({ id: "ter", isRecurring: false }),
    ]);

    expect(dedupedIds.size).toBe(0);
  });

  it("não colapsa um recorrente contra um específico de mesmo nome", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "rec", isRecurring: true }),
      evt({ id: "esp", isRecurring: false }),
    ]);

    expect(dedupedIds.size).toBe(0);
  });

  it("une os dias das ocorrências absorvidas", () => {
    // Série partida ao meio: sem a união, Ter e Qui sumiriam em silêncio.
    const { daysById } = dedupeCalendarEvents([
      evt({ id: "a", recurringDays: [1, 3, 5] }),
      evt({ id: "b", recurringDays: [2, 4] }),
    ]);

    expect(daysById.get("a")).toEqual([1, 3, 5, 2, 4]);
  });

  it("não repete dia que as duas séries já tinham", () => {
    const { daysById } = dedupeCalendarEvents([
      evt({ id: "a", recurringDays: [1, 2, 3, 4, 5] }),
      evt({ id: "b", recurringDays: [1, 2, 3, 4, 5] }),
    ]);

    expect(daysById.get("a")).toEqual([1, 2, 3, 4, 5]);
  });

  it("preserva a ordem original dos dias do sobrevivente", () => {
    // A escala é a do `Date` (§5.3) e a ordem não é semântica — reordenar aqui
    // só faria a planejada nascer diferente do que a linha mostrava.
    const { daysById } = dedupeCalendarEvents([evt({ id: "a", recurringDays: [5, 1, 4, 2, 3] })]);

    expect(daysById.get("a")).toEqual([5, 1, 4, 2, 3]);
  });

  it("não devolve o array do evento, para a união não mutar a entrada", () => {
    const original = [1, 2];
    const { daysById } = dedupeCalendarEvents([
      evt({ id: "a", recurringDays: original }),
      evt({ id: "b", recurringDays: [3] }),
    ]);

    expect(daysById.get("a")).toEqual([1, 2, 3]);
    expect(original).toEqual([1, 2]);
  });

  it("colapsa eventos de dia inteiro de mesmo nome", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "a", startTime: undefined, endTime: undefined }),
      evt({ id: "b", startTime: undefined, endTime: undefined }),
    ]);

    expect([...dedupedIds]).toEqual(["b"]);
  });

  it("não confunde dia inteiro com evento com horário", () => {
    const { dedupedIds } = dedupeCalendarEvents([
      evt({ id: "diaInteiro", startTime: undefined, endTime: undefined }),
      evt({ id: "comHora" }),
    ]);

    expect(dedupedIds.size).toBe(0);
  });
});
