import { describe, it, expect, vi } from "vitest";
import type { CustomField } from "@domain/entities/CustomField";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { LlmNetworkError } from "@infra/integrations/llm/errors";
import { makeDeps, NOW, WS_ATIVO, WS_OUTRO } from "../fakeDeps";

const STAGE: CustomField = {
  id: "cf-stage",
  label: "Project Stage",
  type: "select",
  options: [
    { id: "opt-dev", label: "Development" },
    { id: "opt-qa", label: "QA" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: NOW,
};

const ARCHIVED: CustomField = { ...STAGE, id: "cf-old", label: "Old", archived: true };

function setup(notConfiguredMessage: string | null = null) {
  const deps = makeDeps();
  const llm = { complete: vi.fn(async () => ({ text: "{}" })), listModels: vi.fn() };
  const createLlm = vi.fn(() => llm);
  deps.llm.mockReturnValue({ notConfiguredMessage, createLlm, saveLimits: vi.fn() });
  deps.customFieldRepo.findAll.mockResolvedValue([STAGE, ARCHIVED]);
  return { deps, llm, createLlm };
}

describe("taskText.fields", () => {
  it("devolve a instrução e os campos do workspace, com exemplo e sem arquivado", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "taskText.fields", {});
    expect(res.status).toBe(200);
    expect(deps.projectRepo.findAll).toHaveBeenCalledWith(WS_ATIVO);
    expect(res.body).toEqual({
      workspaceId: WS_ATIVO,
      instruction:
        "Informe Projeto, Categoria, Billable e Project Stage. P= Cliente / C= Reuniões / B= nb / PS= Development",
      fields: [
        { sigla: "P", label: "Projeto", kind: "project", example: "Cliente" },
        { sigla: "C", label: "Categoria", kind: "category", example: "Reuniões" },
        { sigla: "B", label: "Billable", kind: "billable", example: "nb" },
        {
          sigla: "PS",
          label: "Project Stage",
          kind: "select",
          fieldId: "cf-stage",
          example: "Development",
        },
      ],
    });
  });

  it("workspaceId escolhe o catálogo; workspace inexistente é 409", async () => {
    const { deps } = setup();
    await dispatchLocalApiRequest(deps, "taskText.fields", { workspaceId: WS_OUTRO });
    expect(deps.categoryRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    expect(deps.projectCategoryRepo.findAll).toHaveBeenCalledWith(WS_OUTRO);
    const res = await dispatchLocalApiRequest(deps, "taskText.fields", { workspaceId: "nada" });
    expect(res.status).toBe(409);
  });
});

describe("taskText.interpret", () => {
  it("com sigla resolve localmente, sem chamar o provedor, e não inicia nada", async () => {
    const { deps, llm } = setup();
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "Alinhamento P=cliente C=reun PS=dev" },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      workspaceId: WS_ATIVO,
      source: "local",
      name: "Alinhamento",
      projectId: "proj-ativo",
      projectName: "Cliente",
      categoryId: "cat-ativo",
      categoryName: "Reuniões",
      billable: false,
      billableExplicit: false,
      customValues: { "cf-stage": "opt-dev" },
      customFields: [
        {
          fieldId: "cf-stage",
          label: "Project Stage",
          value: "opt-dev",
          valueLabel: "Development",
        },
      ],
      ambiguities: [],
      notFound: [],
    });
    expect(llm.complete).not.toHaveBeenCalled();
    expect(deps.running.startTask).not.toHaveBeenCalled();
    expect(deps.taskRepo.save).not.toHaveBeenCalled();
    expect(deps.plannedTaskRepo.save).not.toHaveBeenCalled();
  });

  it("texto livre vai ao provedor conectado, e o casamento continua local", async () => {
    const { deps, llm } = setup();
    llm.complete.mockResolvedValue({
      text: '{"name":"Daily","fields":{"P":"cliente","B":"b","PS":"qa"}}',
    });
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "daily do cliente, billable, em QA" },
    });
    expect(res.status).toBe(200);
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(res.body).toMatchObject({
      source: "llm",
      name: "Daily",
      projectId: "proj-ativo",
      projectName: "Cliente",
      categoryId: null,
      categoryName: null,
      billable: true,
      billableExplicit: true,
      customValues: { "cf-stage": "opt-qa" },
    });
  });

  it("sem provedor, texto livre vira o nome — não é erro", async () => {
    const { deps, createLlm } = setup("Provedor de IA não configurado.");
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "  Revisão do contrato  " },
    });
    expect(res.status).toBe(200);
    expect(createLlm).not.toHaveBeenCalled();
    expect(res.body).toMatchObject({ source: "local", name: "Revisão do contrato" });
  });

  it("valor que não casa vem em notFound, com o nome nulo", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "Daily P=inexistente" },
    });
    expect(res.body).toMatchObject({
      projectId: null,
      projectName: null,
      notFound: [{ key: "project", sigla: "P", label: "Projeto", query: "inexistente" }],
    });
  });

  it.each([{}, { text: "" }, { text: "   " }, { text: 3 }])(
    "sem texto é 400 (%j), sem chamar o provedor",
    async (body) => {
      const { deps, llm } = setup();
      const res = await dispatchLocalApiRequest(deps, "taskText.interpret", { body });
      expect(res.status).toBe(400);
      expect(llm.complete).not.toHaveBeenCalled();
    }
  );

  it("sem corpo é 400", async () => {
    const { deps } = setup();
    expect((await dispatchLocalApiRequest(deps, "taskText.interpret", {})).status).toBe(400);
  });

  it("workspace do corpo inexistente é 409", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "Daily", workspaceId: "nada" },
    });
    expect(res.status).toBe(409);
  });

  it("falha do provedor é 502 com a frase da tela, não o erro cru", async () => {
    const { deps, llm } = setup();
    llm.complete.mockRejectedValue(new LlmNetworkError("ECONNREFUSED 127.0.0.1"));
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "daily do cliente" },
    });
    expect(res).toEqual({
      status: 502,
      body: { error: "Falha de conexão com o provedor. Verifique a URL e a sua internet." },
    });
  });

  it("resposta ilegível do provedor é 502 pedindo para tentar de novo", async () => {
    const { deps, llm } = setup();
    llm.complete.mockResolvedValue({ text: "não sei" });
    const res = await dispatchLocalApiRequest(deps, "taskText.interpret", {
      body: { text: "daily do cliente" },
    });
    expect(res.status).toBe(502);
    expect((res.body as { error: string }).error).toMatch(/Tente novamente/);
  });
});
