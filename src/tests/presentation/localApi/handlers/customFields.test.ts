import { describe, it, expect } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, NOW } from "../fakeDeps";

const ETAPA: CustomField = {
  id: "f-1",
  label: "Etapa",
  type: "select",
  options: [{ id: "o-1", label: "Discovery" }],
  sortOrder: 0,
  archived: false,
  createdAt: localISO(2026, 9, 1, 8),
};

describe("customFields.list", () => {
  it("lista todos os campos, inclusive arquivados", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([
      ETAPA,
      { ...ETAPA, id: "f-2", archived: true },
    ]);
    const result = await dispatchLocalApiRequest(deps, "customFields.list", {});
    expect(result.status).toBe(200);
    expect(result.body).toEqual([ETAPA, { ...ETAPA, id: "f-2", archived: true }]);
  });
});

describe("customFields.create", () => {
  it("cria o select com as opções e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([ETAPA]);
    const result = await dispatchLocalApiRequest(deps, "customFields.create", {
      body: { label: "Fase", type: "select", optionLabels: ["A", "B", "A"] },
    });
    const saved = deps.customFieldRepo.save.mock.calls[0][0];
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({ label: "Fase", sortOrder: 1, createdAt: NOW, archived: false });
    expect(saved.options.map((o) => o.label)).toEqual(["A", "B"]);
    expect(deps.notifyCustomFieldsChanged).toHaveBeenCalled();
  });

  it("devolve 400 para tipo desconhecido", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "customFields.create", {
      body: { label: "Data", type: "date" },
    });
    expect(result.status).toBe(400);
    expect(deps.customFieldRepo.save).not.toHaveBeenCalled();
    expect(deps.notifyCustomFieldsChanged).not.toHaveBeenCalled();
  });

  it("devolve 400 para select sem opção", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "customFields.create", {
      body: { label: "Fase", type: "select" },
    });
    expect(result.status).toBe(400);
  });

  it("devolve 409 para rótulo repetido", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findByLabel.mockResolvedValue(ETAPA);
    const result = await dispatchLocalApiRequest(deps, "customFields.create", {
      body: { label: "Etapa", type: "text" },
    });
    expect(result.status).toBe(409);
  });
});

describe("customFields.update e customFields.delete", () => {
  it("preserva o id das opções que continuam e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findById.mockResolvedValue(ETAPA);
    const result = await dispatchLocalApiRequest(deps, "customFields.update", {
      id: "f-1",
      body: { optionLabels: ["Entrega", "Discovery"], archived: true },
    });
    const updated = deps.customFieldRepo.update.mock.calls[0][0];
    expect(result.status).toBe(200);
    expect(updated.label).toBe("Etapa");
    expect(updated.archived).toBe(true);
    expect(updated.options[1]).toEqual({ id: "o-1", label: "Discovery" });
    expect(updated.options[0].id).not.toBe("o-1");
    expect(deps.notifyCustomFieldsChanged).toHaveBeenCalled();
  });

  it("devolve 404 ao atualizar campo inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "customFields.update", {
      id: "f-x",
      body: { label: "X" },
    });
    expect(result.status).toBe(404);
    expect(deps.notifyCustomFieldsChanged).not.toHaveBeenCalled();
  });

  it("exclui e avisa as janelas", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findById.mockResolvedValue(ETAPA);
    const result = await dispatchLocalApiRequest(deps, "customFields.delete", { id: "f-1" });
    expect(result).toEqual({ status: 204, body: null });
    expect(deps.customFieldRepo.delete).toHaveBeenCalledWith("f-1");
    expect(deps.notifyCustomFieldsChanged).toHaveBeenCalled();
  });

  it("devolve 404 ao excluir campo inexistente", async () => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "customFields.delete", { id: "f-x" });
    expect(result.status).toBe(404);
    expect(deps.customFieldRepo.delete).not.toHaveBeenCalled();
  });
});
