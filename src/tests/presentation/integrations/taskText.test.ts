import { describe, it, expect } from "vitest";
import { TaskTextResponseError } from "@domain/usecases/llm/taskText/errors";
import type { TaskTextInterpretation } from "@domain/usecases/llm/taskText/types";
import { LlmAuthError, LlmEmptyResponseError } from "@infra/integrations/llm/errors";
import {
  describeTaskTextError,
  isNameOnly,
  taskTextStartInput,
} from "@presentation/integrations/taskText";

function interpretation(over: Partial<TaskTextInterpretation> = {}): TaskTextInterpretation {
  return {
    name: "Alinhamento sprint",
    projectId: null,
    categoryId: null,
    billable: true,
    billableExplicit: false,
    customValues: {},
    ambiguities: [],
    notFound: [],
    source: "llm",
    ...over,
  };
}

describe("describeTaskTextError", () => {
  it("resposta ilegível do provedor pede só tentar de novo", () => {
    expect(describeTaskTextError(new TaskTextResponseError())).toContain("Tente novamente");
    expect(describeTaskTextError(new LlmEmptyResponseError("choices[0] veio nulo"))).toBe(
      describeTaskTextError(new TaskTextResponseError())
    );
  });

  it("o resto é o que o describeLlmError já diz", () => {
    expect(describeTaskTextError(new LlmAuthError())).toContain("Chave inválida");
  });
});

describe("taskTextStartInput", () => {
  it("leva os campos interpretados e inicia no instante do primeiro envio", () => {
    const input = taskTextStartInput(
      interpretation({
        projectId: "p-tech",
        categoryId: "c-dev",
        billable: false,
        customValues: { "f-stage": "opt-dev" },
      }),
      "2026-11-27T13:00:00.000Z"
    );
    expect(input).toEqual({
      name: "Alinhamento sprint",
      projectId: "p-tech",
      categoryId: "c-dev",
      billable: false,
      customValues: { "f-stage": "opt-dev" },
      startTime: "2026-11-27T13:00:00.000Z",
      plannedTaskId: null,
    });
  });

  it("ambiguidade não resolvida segue vazia", () => {
    const input = taskTextStartInput(
      interpretation({
        ambiguities: [
          { key: "project", sigla: "P", label: "Projeto", query: "acme", candidates: [] },
        ],
      }),
      "2026-11-27T13:00:00.000Z"
    );
    expect(input.projectId).toBeNull();
  });
});

describe("isNameOnly", () => {
  it("só o nome: nada a conferir na prévia", () => {
    expect(isNameOnly(interpretation())).toBe(true);
  });

  it("qualquer campo, ambiguidade ou não encontrado pede a prévia", () => {
    expect(isNameOnly(interpretation({ projectId: "p" }))).toBe(false);
    expect(isNameOnly(interpretation({ billableExplicit: true }))).toBe(false);
    expect(isNameOnly(interpretation({ customValues: { f: "x" } }))).toBe(false);
    expect(
      isNameOnly(
        interpretation({ notFound: [{ key: "category", sigla: "C", label: "C", query: "x" }] })
      )
    ).toBe(false);
  });
});
