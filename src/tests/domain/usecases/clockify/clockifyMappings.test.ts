import { describe, it, expect } from "vitest";
import {
  clockifyMappingsFor,
  withClockifyCategoryMapping,
  withClockifyProjectMapping,
} from "@domain/usecases/clockify/clockifyMappings";
import type { ClockifyProjectMapping } from "@shared/types/clockifyConfig";

const all: ClockifyProjectMapping[] = [
  {
    deskclockProjectId: "p1",
    clockifyProjectId: "c1",
    clockifyProjectName: "A",
    workspaceId: "w1",
  },
  {
    deskclockProjectId: "p1",
    clockifyProjectId: "c9",
    clockifyProjectName: "Z",
    workspaceId: "w2",
  },
];

describe("vínculos do Clockify", () => {
  it("recorta pelo workspace do Clockify", () => {
    expect(clockifyMappingsFor(all, "w2").map((m) => m.clockifyProjectId)).toEqual(["c9"]);
  });

  it("vincular troca só o do mesmo workspace; null desvincula", () => {
    const next = withClockifyProjectMapping(all, "w1", "p1", { id: "c2", name: "B" });
    expect(next).toHaveLength(2);
    expect(clockifyMappingsFor(next, "w1")[0]).toMatchObject({ clockifyProjectId: "c2" });
    expect(clockifyMappingsFor(next, "w2")[0]).toMatchObject({ clockifyProjectId: "c9" });
    expect(clockifyMappingsFor(withClockifyProjectMapping(all, "w1", "p1", null), "w1")).toEqual(
      []
    );
  });

  it("categoria com lista vazia continua vinculada", () => {
    const next = withClockifyCategoryMapping([], "w1", "cat", []);
    expect(next).toEqual([{ deskclockCategoryId: "cat", clockifyTagIds: [], workspaceId: "w1" }]);
  });
});
