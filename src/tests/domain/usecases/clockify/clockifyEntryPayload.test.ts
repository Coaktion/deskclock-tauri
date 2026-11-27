import { describe, it, expect } from "vitest";
import {
  buildClockifyEntryPayload,
  clockifyEntryDraftError,
  clockifyEntryInstant,
  clockifyProjectIdByName,
  CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED,
  CLOCKIFY_ENTRY_PROJECT_REQUIRED,
  type ClockifyEntryDraft,
} from "@domain/usecases/clockify/clockifyEntryPayload";
import { localISO } from "../../../helpers/localTime";

function draft(overrides: Partial<ClockifyEntryDraft> = {}): ClockifyEntryDraft {
  return {
    description: "  Revisão  ",
    projectId: "cp",
    tagIds: ["t1"],
    billable: true,
    dateISO: "2026-09-15",
    startHHMM: "09:00",
    endHHMM: "10:30",
    ...overrides,
  };
}

describe("clockifyEntryDraftError", () => {
  it("exige descrição não vazia e projeto", () => {
    expect(clockifyEntryDraftError(draft())).toBeNull();
    expect(clockifyEntryDraftError(draft({ description: "   " }))).toBe(
      CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED
    );
    expect(clockifyEntryDraftError(draft({ projectId: null }))).toBe(
      CLOCKIFY_ENTRY_PROJECT_REQUIRED
    );
  });
});

describe("clockifyEntryInstant", () => {
  it("monta o instante no dia e na hora locais", () => {
    expect(clockifyEntryInstant("2026-09-15", "09:05")).toBe(localISO(2026, 9, 15, 9, 5));
  });
});

describe("buildClockifyEntryPayload", () => {
  it("apara a descrição e leva projeto e tags", () => {
    expect(buildClockifyEntryPayload(draft())).toEqual({
      start: localISO(2026, 9, 15, 9),
      end: localISO(2026, 9, 15, 10, 30),
      description: "Revisão",
      billable: true,
      projectId: "cp",
      tagIds: ["t1"],
    });
  });

  it("fim antes do início vai para o dia seguinte", () => {
    const payload = buildClockifyEntryPayload(draft({ startHHMM: "23:00", endHHMM: "01:00" }));
    expect(payload.start).toBe(localISO(2026, 9, 15, 23));
    expect(payload.end).toBe(localISO(2026, 9, 16, 1));
  });

  it("sem tags e sem projeto, as chaves ficam fora", () => {
    const payload = buildClockifyEntryPayload(draft({ tagIds: [], projectId: null }));
    expect("tagIds" in payload).toBe(false);
    expect("projectId" in payload).toBe(false);
  });
});

describe("clockifyProjectIdByName", () => {
  const projects = [
    { id: "p1", name: "Site", clientName: "ACME" },
    { id: "p2", name: "Interno", clientName: null },
  ];

  it("casa pelo nome exibido, com o cliente", () => {
    expect(clockifyProjectIdByName(projects, "ACME - Site")).toBe("p1");
    expect(clockifyProjectIdByName(projects, "Interno")).toBe("p2");
  });

  it("o nome sem o cliente não casa", () => {
    expect(clockifyProjectIdByName(projects, "Site")).toBeNull();
  });
});
