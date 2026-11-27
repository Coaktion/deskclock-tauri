import { describe, it, expect } from "vitest";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import type { CustomField } from "@domain/entities/CustomField";
import {
  generateTaskExport,
  mergeTasksForExport,
} from "@domain/usecases/exportProfiles/GenerateTaskExport";
import { customColumnField } from "@domain/utils/exportFormatter";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { endOfDayISO, startOfDayISO } from "@shared/utils/time";
import { localISO } from "../../../helpers/localTime";
import { makeDeps, makeTask, TODAY, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

function makeProfile(overrides: Partial<ExportProfile> = {}): ExportProfile {
  return {
    id: "prof-1",
    workspaceId: WS_ATIVO,
    name: "Padrão",
    isDefault: true,
    format: "csv",
    separator: "comma",
    durationFormat: "hh:mm:ss",
    dateFormat: "iso",
    columns: [...DEFAULT_COLUMNS],
    ...overrides,
  };
}

const ETAPA: CustomField = {
  id: "f-1",
  label: "Etapa",
  type: "text",
  options: [],
  sortOrder: 0,
  archived: false,
  createdAt: localISO(2026, 9, 1, 8),
};
const ANTIGO: CustomField = { ...ETAPA, id: "f-2", label: "Antigo", archived: true };

function withProfiles(profiles: ExportProfile[]) {
  const deps = makeDeps();
  deps.exportProfileRepo.findAll.mockImplementation(async (ws?: string) =>
    profiles.filter((p) => p.workspaceId === ws)
  );
  return deps;
}

describe("exportProfiles.list", () => {
  it("lista os perfis do workspace ativo quando não vem workspaceId", async () => {
    const deps = withProfiles([makeProfile(), makeProfile({ id: "x", workspaceId: WS_OUTRO })]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.list", {});
    expect(result.status).toBe(200);
    expect(result.body).toEqual([makeProfile()]);
    expect(deps.exportProfileRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
  });

  it("workspace inexistente é 409", async () => {
    const result = await dispatchLocalApiRequest(makeDeps(), "exportProfiles.list", {
      workspaceId: "nao-existe",
    });
    expect(result.status).toBe(409);
  });
});

describe("exportProfiles.create", () => {
  it("usa os valores do formulário novo e acrescenta os campos ativos invisíveis", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([ETAPA, ANTIGO]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.create", {
      body: { name: "Cliente" },
    });
    const saved = deps.exportProfileRepo.save.mock.calls[0][0];
    expect(result.status).toBe(201);
    expect(saved).toMatchObject({
      workspaceId: WS_ATIVO,
      name: "Cliente",
      isDefault: false,
      format: "csv",
      separator: "comma",
      durationFormat: "hh:mm:ss",
      dateFormat: "iso",
    });
    expect(saved.columns).toEqual([
      ...DEFAULT_COLUMNS,
      { field: customColumnField("f-1"), label: "Etapa", visible: false, order: 7 },
    ]);
    expect(deps.exportProfileRepo.setDefault).not.toHaveBeenCalled();
  });

  it("isDefault marca o padrão do workspace", async () => {
    const deps = makeDeps();
    await dispatchLocalApiRequest(deps, "exportProfiles.create", {
      body: { name: "Novo", isDefault: true, format: "json", workspaceId: WS_OUTRO },
    });
    const saved = deps.exportProfileRepo.save.mock.calls[0][0];
    expect(saved).toMatchObject({ workspaceId: WS_OUTRO, format: "json" });
    expect(deps.exportProfileRepo.setDefault).toHaveBeenCalledWith(saved.id);
  });

  it.each([
    [{ name: "  " }, "name"],
    [{ name: "a", format: "xlsx" }, "format"],
    [{ name: "a", durationFormat: "HH:MM" }, "durationFormat"],
    [{ name: "a", columns: [{ field: "foo", label: "Foo", visible: true, order: 0 }] }, "foo"],
    [
      {
        name: "a",
        columns: [
          { field: "name", label: "A", visible: true, order: 0 },
          { field: "name", label: "B", visible: true, order: 1 },
        ],
      },
      "repetida",
    ],
    [{ name: "a", columns: [{ field: "name" }] }, "columns"],
  ])("recusa %j com 400", async (body, hint) => {
    const deps = makeDeps();
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.create", { body });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toContain(hint);
    expect(deps.exportProfileRepo.save).not.toHaveBeenCalled();
  });

  it("aceita coluna de campo personalizado arquivado", async () => {
    const deps = makeDeps();
    deps.customFieldRepo.findAll.mockResolvedValue([ANTIGO]);
    const column = { field: customColumnField("f-2"), label: "Antigo", visible: true, order: 0 };
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.create", {
      body: { name: "a", columns: [column] },
    });
    expect(result.status).toBe(201);
    expect(deps.exportProfileRepo.save.mock.calls[0][0].columns).toEqual([column]);
  });
});

describe("exportProfiles.update", () => {
  it("muda só o que veio", async () => {
    const deps = withProfiles([makeProfile()]);
    deps.exportProfileRepo.findById.mockResolvedValue(makeProfile());
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.update", {
      id: "prof-1",
      body: { dateFormat: "dd/mm/yyyy", name: null },
    });
    expect(result.status).toBe(200);
    expect(deps.exportProfileRepo.update).toHaveBeenCalledWith(
      makeProfile({ dateFormat: "dd/mm/yyyy" })
    );
  });

  it("isDefault: true torna o perfil padrão", async () => {
    const deps = withProfiles([makeProfile({ isDefault: false })]);
    deps.exportProfileRepo.findById.mockResolvedValue(makeProfile({ isDefault: false }));
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.update", {
      id: "prof-1",
      body: { isDefault: true },
    });
    expect(result.status).toBe(200);
    expect(deps.exportProfileRepo.setDefault).toHaveBeenCalledWith("prof-1");
  });

  it("columns renumera o order na ordem pedida e acrescenta o campo ativo invisível", async () => {
    const deps = withProfiles([makeProfile()]);
    deps.exportProfileRepo.findById.mockResolvedValue(makeProfile());
    deps.customFieldRepo.findAll.mockResolvedValue([ETAPA]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.update", {
      id: "prof-1",
      body: {
        columns: [
          { field: "project", label: "Projeto", visible: true, order: 7 },
          { field: "name", label: "Nome", visible: true, order: 3 },
        ],
      },
    });
    expect(result.status).toBe(200);
    const saved = deps.exportProfileRepo.update.mock.calls[0][0] as ExportProfile;
    expect(saved.columns.map((c) => [c.field, c.order])).toEqual([
      ["name", 0],
      ["project", 1],
      [customColumnField("f-1"), 2],
    ]);
    expect(saved.columns[2].visible).toBe(false);
  });

  it.each([
    ["coluna desconhecida", { columns: [{ field: "x", label: "X", visible: true, order: 0 }] }],
    ["formato inválido", { format: "xml" }],
  ])("recusa %s com 400 e não grava", async (_caso, body) => {
    const deps = withProfiles([makeProfile()]);
    deps.exportProfileRepo.findById.mockResolvedValue(makeProfile());
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.update", {
      id: "prof-1",
      body,
    });
    expect(result.status).toBe(400);
    expect(deps.exportProfileRepo.update).not.toHaveBeenCalled();
  });

  it.each([
    ["exportProfiles.update", { format: "json" }],
    ["exportProfiles.setDefault", undefined],
    ["exportProfiles.delete", undefined],
  ])("%s de perfil de outro workspace é 404", async (op, body) => {
    const deps = withProfiles([
      makeProfile({ workspaceId: WS_OUTRO }),
      makeProfile({ id: "prof-2", workspaceId: WS_OUTRO, isDefault: false }),
    ]);
    const result = await dispatchLocalApiRequest(deps, op, { id: "prof-1", body });
    expect(result.status).toBe(404);
    expect(deps.exportProfileRepo.update).not.toHaveBeenCalled();
    expect(deps.exportProfileRepo.setDefault).not.toHaveBeenCalled();
    expect(deps.exportProfileRepo.delete).not.toHaveBeenCalled();
  });
});

describe("exportProfiles.delete", () => {
  it("exclui quando há outro perfil no workspace", async () => {
    const deps = withProfiles([makeProfile(), makeProfile({ id: "prof-2", isDefault: false })]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.delete", { id: "prof-2" });
    expect(result.status).toBe(204);
    expect(deps.exportProfileRepo.delete).toHaveBeenCalledWith("prof-2");
  });

  it("o único perfil do workspace é 409, como a lixeira desabilitada da tela", async () => {
    const deps = withProfiles([makeProfile()]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.delete", { id: "prof-1" });
    expect(result.status).toBe(409);
    expect(deps.exportProfileRepo.delete).not.toHaveBeenCalled();
  });
});

describe("exportProfiles.setDefault", () => {
  it("marca o padrão e devolve o perfil", async () => {
    const deps = withProfiles([makeProfile({ isDefault: false })]);
    const result = await dispatchLocalApiRequest(deps, "exportProfiles.setDefault", {
      id: "prof-1",
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ id: "prof-1", isDefault: true });
    expect(deps.exportProfileRepo.setDefault).toHaveBeenCalledWith("prof-1");
  });
});

describe("export.generate", () => {
  const reuniao1 = makeTask({
    id: "t-1",
    name: "Reunião",
    projectId: "proj-ativo",
    status: "completed",
    startTime: localISO(2026, 9, 15, 9),
    endTime: localISO(2026, 9, 15, 9, 30),
    durationSeconds: 1800,
  });
  const reuniao2 = makeTask({
    ...reuniao1,
    id: "t-2",
    startTime: localISO(2026, 9, 15, 14),
    endTime: localISO(2026, 9, 15, 15),
    durationSeconds: 3600,
  });
  const avulsa = makeTask({
    id: "t-3",
    name: "Avulsa",
    status: "completed",
    durationSeconds: 60,
    endTime: localISO(2026, 9, 15, 9, 1),
  });
  const emExecucao = makeTask({ id: "t-4", status: "running" });

  function exportDeps(profiles = [makeProfile()]) {
    const deps = withProfiles(profiles);
    deps.taskRepo.findByDateRange.mockResolvedValue([reuniao1, avulsa, reuniao2, emExecucao]);
    deps.customFieldRepo.findAll.mockResolvedValue([ETAPA]);
    return deps;
  }

  it("sem corpo: hoje, workspace ativo, perfil padrão, grupos somados", async () => {
    const deps = exportDeps([
      makeProfile({ id: "outro", isDefault: false, name: "A" }),
      makeProfile(),
    ]);
    const result = await dispatchLocalApiRequest(deps, "export.generate", {});
    expect(result.status).toBe(200);
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      startOfDayISO(TODAY),
      endOfDayISO(TODAY),
      WS_ATIVO
    );
    const body = result.body as Record<string, unknown>;
    expect(body).toMatchObject({
      fileName: "export.csv",
      format: "csv",
      mimeType: "text/csv",
      rowCount: 2,
      profileId: "prof-1",
      workspaceId: WS_ATIVO,
      from: TODAY,
      to: TODAY,
    });
    const lines = (body.content as string).split("\n");
    expect(lines[0]).toBe("Nome,Projeto,Categoria,Billable,Início,Fim,Duração");
    expect(lines[1]).toMatch(/^Reunião,Cliente,,Sim,.*,01:30:00$/);
    expect(lines[2]).toMatch(/^Avulsa,,,Sim,.*,00:01:00$/);
  });

  it("gera o mesmo conteúdo que o modal para a mesma seleção", async () => {
    const profile = makeProfile({ format: "json", durationFormat: "minutes" });
    const deps = exportDeps([profile]);
    const result = await dispatchLocalApiRequest(deps, "export.generate", {
      body: { taskIds: ["t-2", "t-3"] },
    });
    // O caminho do modal: lista carregada, filtrada pela seleção, agrupada e formatada.
    const modal = generateTaskExport(mergeTasksForExport([avulsa, reuniao2]), profile, {
      projects: await deps.projectRepo.findAll(),
      categories: await deps.categoryRepo.findAll(),
      customFields: [ETAPA],
    });
    expect(result.body).toMatchObject(modal);
    expect(JSON.parse(modal.content)).toHaveLength(2);
  });

  it("profileId escolhe o perfil; de outro workspace é 404", async () => {
    const json = makeProfile({ id: "json", isDefault: false, format: "json" });
    const ok = await dispatchLocalApiRequest(exportDeps([makeProfile(), json]), "export.generate", {
      body: { profileId: "json" },
    });
    expect(ok.body).toMatchObject({ format: "json", fileName: "export.json", profileId: "json" });

    const missing = await dispatchLocalApiRequest(exportDeps(), "export.generate", {
      body: { profileId: "json" },
    });
    expect(missing.status).toBe(404);
  });

  it("workspace sem perfil é 409", async () => {
    const result = await dispatchLocalApiRequest(exportDeps([]), "export.generate", {});
    expect(result.status).toBe(409);
  });

  it("taskIds fora das concluídas do período é 409; vazio é 400", async () => {
    const outside = await dispatchLocalApiRequest(exportDeps(), "export.generate", {
      body: { taskIds: ["t-1", "t-4"] },
    });
    expect(outside.status).toBe(409);
    expect(JSON.stringify(outside.body)).toContain("t-4");

    const empty = await dispatchLocalApiRequest(exportDeps(), "export.generate", {
      body: { taskIds: [] },
    });
    expect(empty.status).toBe(400);
  });

  it("período inválido é 400", async () => {
    const result = await dispatchLocalApiRequest(exportDeps(), "export.generate", {
      body: { from: "2026-09-16", to: "2026-09-15" },
    });
    expect(result.status).toBe(400);
  });

  it("período sem tarefa devolve conteúdo vazio", async () => {
    const deps = exportDeps();
    deps.taskRepo.findByDateRange.mockResolvedValue([]);
    const result = await dispatchLocalApiRequest(deps, "export.generate", {});
    expect(result.body).toMatchObject({ content: "", rowCount: 0 });
  });
});
