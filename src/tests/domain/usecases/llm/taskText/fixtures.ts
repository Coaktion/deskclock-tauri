import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { TaskTextCatalog } from "@domain/usecases/llm/taskText/types";

export function project(id: string, name: string): Project {
  return { id, workspaceId: "ws", name, colorIndex: 0 };
}

export function category(id: string, name: string, defaultBillable = true): Category {
  return { id, workspaceId: "ws", name, defaultBillable };
}

export function customField(overrides: Partial<CustomField> & { id: string }): CustomField {
  return {
    label: overrides.id,
    type: "text",
    options: [],
    sortOrder: 0,
    archived: false,
    createdAt: "2026-11-27T12:00:00.000Z",
    ...overrides,
  };
}

export const STAGE_FIELD = customField({
  id: "f-stage",
  label: "Project Stage",
  type: "select",
  sortOrder: 1,
  options: [
    { id: "opt-dev", label: "Development" },
    { id: "opt-disc", label: "Discovery" },
  ],
});

export const REASON_FIELD = customField({
  id: "f-reason",
  label: "Non Billable reason",
  type: "select",
  sortOrder: 2,
  options: [
    { id: "opt-peer", label: "Peer technical" },
    { id: "opt-train", label: "Treinamento" },
  ],
});

export function makeCatalog(overrides: Partial<TaskTextCatalog> = {}): TaskTextCatalog {
  return {
    projects: [
      project("p-tech", "Tech interno"),
      project("p-acme", "Acme Corp"),
      project("p-acmeb", "Acme Brasil"),
      project("p-sao", "São Paulo Futebol"),
    ],
    categories: [
      category("c-dev", "Development NB", false),
      category("c-meet", "Meeting"),
      category("c-sup", "Suporte"),
    ],
    projectCategoryMap: new Map(),
    customFields: [STAGE_FIELD, REASON_FIELD],
    ...overrides,
  };
}
