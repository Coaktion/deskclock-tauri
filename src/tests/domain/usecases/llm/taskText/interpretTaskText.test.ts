import { describe, it, expect, vi } from "vitest";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { TaskTextResponseError } from "@domain/usecases/llm/taskText/errors";
import { interpretTaskText } from "@domain/usecases/llm/taskText/interpretTaskText";
import { REASON_FIELD, STAGE_FIELD, makeCatalog } from "./fixtures";

const catalog = makeCatalog();
const hints = buildTaskFieldHints([STAGE_FIELD, REASON_FIELD], catalog);

function makeLlm(text: string): ILlmApi {
  return {
    complete: vi.fn().mockResolvedValue({ text }),
    listModels: vi.fn(),
  };
}

describe("interpretTaskText", () => {
  it("texto com sigla é resolvido localmente, sem chamar o provedor", async () => {
    const llm = makeLlm("{}");
    const result = await interpretTaskText({
      llm,
      text: "Alinhamento P=tech int C=dev PS=dev",
      hints,
      catalog,
    });
    expect(llm.complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      name: "Alinhamento",
      projectId: "p-tech",
      categoryId: "c-dev",
      billable: false,
      customValues: { [STAGE_FIELD.id]: "opt-dev" },
      source: "local",
    });
  });

  it("texto por posição é resolvido localmente, sem chamar o provedor", async () => {
    const llm = makeLlm("{}");
    const result = await interpretTaskText({
      llm,
      text: "Alinhamento, tech int, Meeting",
      hints,
      catalog,
    });
    expect(llm.complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      name: "Alinhamento",
      projectId: "p-tech",
      categoryId: "c-meet",
      source: "local",
    });
  });

  it("texto livre com vírgula ainda vai ao provedor", async () => {
    const llm = makeLlm('{"name":"Reunião com o time","fields":{}}');
    const result = await interpretTaskText({
      llm,
      text: "Reunião com o time, sobre a sprint",
      hints,
      catalog,
    });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ name: "Reunião com o time", source: "llm" });
  });

  it("texto livre vai ao provedor e é casado localmente", async () => {
    const llm = makeLlm('```json\n{"name":"Alinhamento","fields":{"P":"acme corp","B":"nb"}}\n```');
    const result = await interpretTaskText({
      llm,
      text: "Alinhamento na Acme nb",
      hints,
      catalog,
    });
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      name: "Alinhamento",
      projectId: "p-acme",
      billable: false,
      billableExplicit: true,
      source: "llm",
    });
  });

  it("sem provedor, o texto livre vira o nome", async () => {
    const result = await interpretTaskText({ llm: null, text: "  Revisar PR  ", hints, catalog });
    expect(result).toMatchObject({ name: "Revisar PR", projectId: null, source: "local" });
  });

  it("texto vazio não chama o provedor e devolve nome null", async () => {
    const llm = makeLlm("{}");
    const result = await interpretTaskText({ llm, text: "   ", hints, catalog });
    expect(llm.complete).not.toHaveBeenCalled();
    expect(result.name).toBeNull();
  });

  it("erro do provedor propaga", async () => {
    const llm = makeLlm("");
    vi.mocked(llm.complete).mockRejectedValue(new Error("rate limit"));
    await expect(interpretTaskText({ llm, text: "Daily", hints, catalog })).rejects.toThrow(
      "rate limit"
    );
  });

  it("resposta ilegível lança TaskTextResponseError", async () => {
    const llm = makeLlm("não sei");
    await expect(interpretTaskText({ llm, text: "Daily", hints, catalog })).rejects.toThrow(
      TaskTextResponseError
    );
  });
});
