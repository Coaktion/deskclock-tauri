import { describe, it, expect, vi } from "vitest";
import { createExportProfile } from "@domain/usecases/exportProfiles/CreateExportProfile";
import { updateExportProfile } from "@domain/usecases/exportProfiles/UpdateExportProfile";
import { deleteExportProfile } from "@domain/usecases/exportProfiles/DeleteExportProfile";
import { getExportProfiles } from "@domain/usecases/exportProfiles/GetExportProfiles";
import { setDefaultExportProfile } from "@domain/usecases/exportProfiles/SetDefaultExportProfile";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";

function makeRepo(overrides: Partial<IExportProfileRepository> = {}): IExportProfileRepository {
  return {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findDefault: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
    setDefault: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    id: "ep1",
    name: "Padrão",
    isDefault: false,
    format: "csv",
    separator: "comma",
    durationFormat: "hh:mm:ss",
    dateFormat: "iso",
    columns: [...DEFAULT_COLUMNS],
    ...overrides,
  };
}

describe("createExportProfile", () => {
  it("cria perfil com id gerado e chama save", async () => {
    const repo = makeRepo();
    const profile = await createExportProfile(repo, {
      name: "Meu Perfil",
      format: "csv",
      separator: "semicolon",
      durationFormat: "decimal",
      dateFormat: "dd/mm/yyyy",
    });
    expect(profile.id).toBeTruthy();
    expect(profile.name).toBe("Meu Perfil");
    expect(profile.isDefault).toBe(false);
    expect(profile.columns).toEqual(DEFAULT_COLUMNS);
    expect(repo.save).toHaveBeenCalledWith(profile);
  });

  it("marca como default quando isDefault=true", async () => {
    const repo = makeRepo();
    const profile = await createExportProfile(repo, {
      name: "P",
      format: "json",
      separator: "comma",
      durationFormat: "minutes",
      dateFormat: "iso",
      isDefault: true,
    });
    expect(profile.isDefault).toBe(true);
    expect(repo.setDefault).toHaveBeenCalledWith(profile.id);
  });
});

describe("updateExportProfile", () => {
  it("atualiza campos e chama repo.update", async () => {
    const existing = makeProfile();
    const repo = makeRepo({ findById: vi.fn(async () => existing) });
    const updated = await updateExportProfile(repo, "ep1", { name: "Novo Nome" });
    expect(updated.name).toBe("Novo Nome");
    expect(repo.update).toHaveBeenCalledWith(updated);
  });

  it("lança erro quando perfil não existe", async () => {
    const repo = makeRepo({ findById: vi.fn(async () => null) });
    await expect(updateExportProfile(repo, "inexistente", { name: "X" })).rejects.toThrow();
  });

  it("chama setDefault ao marcar como padrão", async () => {
    const existing = makeProfile();
    const repo = makeRepo({ findById: vi.fn(async () => existing) });
    await updateExportProfile(repo, "ep1", { isDefault: true });
    expect(repo.setDefault).toHaveBeenCalledWith("ep1");
  });
});

describe("deleteExportProfile", () => {
  it("chama repo.delete com o id correto", async () => {
    const repo = makeRepo();
    await deleteExportProfile(repo, "ep1");
    expect(repo.delete).toHaveBeenCalledWith("ep1");
  });
});

describe("getExportProfiles", () => {
  it("retorna lista do repositório", async () => {
    const profiles = [makeProfile()];
    const repo = makeRepo({ findAll: vi.fn(async () => profiles) });
    const result = await getExportProfiles(repo);
    expect(result).toEqual(profiles);
  });
});

describe("setDefaultExportProfile", () => {
  it("chama repo.setDefault com o id correto", async () => {
    const repo = makeRepo();
    await setDefaultExportProfile(repo, "ep1");
    expect(repo.setDefault).toHaveBeenCalledWith("ep1");
  });
});
