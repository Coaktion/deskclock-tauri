import { describe, it, expect, vi } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import {
  createOrLinkCatalogField,
  refreshCatalogFieldOptions,
} from "@presentation/integrations/mondayCatalogFields";

const stage: CustomField = {
  id: "f1",
  label: "Project Stage",
  type: "select",
  options: [{ id: "o1", label: "Discovery" }],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-01-01T00:00:00Z",
};

function deps(fields: CustomField[]) {
  return {
    fields,
    createField: vi.fn(async () => ({ ...stage, id: "novo" })),
    updateField: vi.fn(async () => {}),
    link: vi.fn(async () => {}),
  };
}

describe("ações dos campos de catálogo do Monday", () => {
  it("cria com os rótulos e vincula", async () => {
    const d = deps([]);
    const result = await createOrLinkCatalogField(d, {
      title: "Project Stage",
      defaultFieldLabel: "",
      optionLabels: ["Discovery", "Build"],
    });
    expect(d.createField).toHaveBeenCalledWith({
      label: "Project Stage",
      type: "select",
      optionLabels: ["Discovery", "Build"],
    });
    expect(d.link).toHaveBeenCalledWith("novo");
    expect(result).toMatchObject({ label: "Project Stage", reused: false });
  });

  it("homônimo de seleção é só vinculado", async () => {
    const d = deps([stage]);
    const result = await createOrLinkCatalogField(d, {
      title: "Project Stage",
      defaultFieldLabel: "project stage",
      optionLabels: ["x"],
    });
    expect(d.createField).not.toHaveBeenCalled();
    expect(d.link).toHaveBeenCalledWith("f1");
    expect(result.reused).toBe(true);
  });

  it("homônimo de outro tipo recusa sem vincular", async () => {
    const d = deps([{ ...stage, type: "text" }]);
    await expect(
      createOrLinkCatalogField(d, {
        title: "Project Stage",
        defaultFieldLabel: "",
        optionLabels: [],
      })
    ).rejects.toThrow(/não é de seleção/);
    expect(d.link).not.toHaveBeenCalled();
  });

  it("atualizar une as opções e conta as novas", async () => {
    const d = deps([stage]);
    expect(await refreshCatalogFieldOptions(d, stage, ["Build", "Discovery"])).toBe(1);
    expect(d.updateField).toHaveBeenCalledWith("f1", { optionLabels: ["Discovery", "Build"] });
  });
});
