import { describe, it, expect } from "vitest";
import { buildTaskTextContext } from "@domain/usecases/llm/taskText/buildTaskTextContext";
import { STAGE_FIELD, category, customField, project } from "./fixtures";

const ARCHIVED = customField({ id: "f-old", label: "Antigo", archived: true, sortOrder: 0 });

function build() {
  return buildTaskTextContext({
    projects: [project("p-acme", "Acme Corp")],
    categories: [category("c-meet", "Meeting"), category("c-dev", "Dev")],
    associations: [
      { projectId: "p-acme", categoryId: "c-meet", source: "manual", createdAt: "x" },
      { projectId: "p-acme", categoryId: "c-dev", source: "monday", createdAt: "x" },
    ],
    customFields: [ARCHIVED, STAGE_FIELD],
  });
}

describe("buildTaskTextContext", () => {
  it("o catálogo leva só os campos ativos", () => {
    expect(build().catalog.customFields).toEqual([STAGE_FIELD]);
  });

  it("agrupa as associações por projeto, sem olhar a origem", () => {
    const map = build().catalog.projectCategoryMap;
    expect([...(map.get("p-acme") ?? [])]).toEqual(["c-meet", "c-dev"]);
  });

  it("as dicas são os três fixos e os campos ativos, com o exemplo do catálogo", () => {
    const { hints } = build();
    expect(hints.map((h) => h.sigla)).toEqual(["P", "C", "B", "PS"]);
    expect(hints[0].example).toBe("Acme Corp");
    expect(hints[1].example).toBe("Meeting");
  });
});
