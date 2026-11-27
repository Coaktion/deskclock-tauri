import { describe, it, expect } from "vitest";
import {
  clockifyEntriesHiddenByTags,
  clockifyEntryDurationSeconds,
  groupClockifyEntriesByDay,
  projectDisplayName,
  visibleClockifyEntries,
} from "@domain/usecases/clockify/clockifyEntries";
import type { ClockifyTimeEntryFull } from "@shared/types/clockify";
import { localISO } from "../../../helpers/localTime";

function entry(
  id: string,
  start: string,
  end: string | null,
  tagIds: string[] = []
): ClockifyTimeEntryFull {
  return {
    id,
    description: `Apontamento ${id}`,
    projectId: null,
    tagIds,
    billable: true,
    timeInterval: { start, end, duration: null },
  };
}

describe("projectDisplayName", () => {
  it("prefixa o cliente quando há", () => {
    expect(projectDisplayName({ name: "Site", clientName: "ACME" })).toBe("ACME - Site");
    expect(projectDisplayName({ name: "Site", clientName: null })).toBe("Site");
  });
});

describe("clockifyEntryDurationSeconds", () => {
  it("conta do início ao fim e zera o que está em andamento", () => {
    expect(
      clockifyEntryDurationSeconds(entry("a", localISO(2026, 9, 15, 9), localISO(2026, 9, 15, 10)))
    ).toBe(3600);
    expect(clockifyEntryDurationSeconds(entry("b", localISO(2026, 9, 15, 9), null))).toBe(0);
  });
});

describe("visibleClockifyEntries", () => {
  const entries = [
    entry("a", localISO(2026, 9, 15, 9), localISO(2026, 9, 15, 10), ["t1", "t2"]),
    entry("b", localISO(2026, 9, 15, 11), localISO(2026, 9, 15, 12), ["t1"]),
    entry("c", localISO(2026, 9, 15, 13), null, ["t1", "t2"]),
  ];

  it("tira o apontamento em andamento", () => {
    const visible = visibleClockifyEntries(entries, { onlyDefaultTags: false, defaultTagIds: [] });
    expect(visible.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("com o filtro ligado, exige todas as tags padrão", () => {
    const filter = { onlyDefaultTags: true, defaultTagIds: ["t1", "t2"] };
    expect(visibleClockifyEntries(entries, filter).map((e) => e.id)).toEqual(["a"]);
  });

  it("filtro ligado sem tag padrão não filtra", () => {
    const filter = { onlyDefaultTags: true, defaultTagIds: [] };
    expect(visibleClockifyEntries(entries, filter)).toHaveLength(2);
  });
});

describe("clockifyEntriesHiddenByTags", () => {
  it("acende quando o filtro de tags esconde todos os concluídos", () => {
    const entries = [entry("a", localISO(2026, 9, 15, 9), localISO(2026, 9, 15, 10))];
    const filter = { onlyDefaultTags: true, defaultTagIds: ["t1"] };
    const visible = visibleClockifyEntries(entries, filter);
    expect(clockifyEntriesHiddenByTags(entries, visible, filter)).toBe(true);
    expect(
      clockifyEntriesHiddenByTags(entries, visible, { onlyDefaultTags: false, defaultTagIds: [] })
    ).toBe(false);
  });

  it("não acende quando só havia o apontamento em andamento", () => {
    const entries = [entry("a", localISO(2026, 9, 15, 9), null)];
    const filter = { onlyDefaultTags: true, defaultTagIds: ["t1"] };
    expect(clockifyEntriesHiddenByTags(entries, [], filter)).toBe(false);
  });
});

describe("groupClockifyEntriesByDay", () => {
  it("agrupa por dia local, do mais recente, e soma a duração", () => {
    const groups = groupClockifyEntriesByDay([
      entry("a", localISO(2026, 9, 14, 9), localISO(2026, 9, 14, 10)),
      entry("b", localISO(2026, 9, 15, 9), localISO(2026, 9, 15, 9, 30)),
      entry("c", localISO(2026, 9, 15, 14), localISO(2026, 9, 15, 15)),
    ]);
    expect(groups.map((g) => g.dateISO)).toEqual(["2026-09-15", "2026-09-14"]);
    expect(groups[0].entries.map((e) => e.id)).toEqual(["c", "b"]);
    expect(groups[0].totalSeconds).toBe(5400);
  });
});
