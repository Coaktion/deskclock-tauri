import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { TaskTextResponseError } from "@domain/usecases/llm/taskText/errors";
import { parseTaskTextResponse } from "@domain/usecases/llm/taskText/parseTaskTextResponse";
import { STAGE_FIELD, makeCatalog } from "./fixtures";

const hints = buildTaskFieldHints([STAGE_FIELD], makeCatalog());

describe("parseTaskTextResponse", () => {
  it("lê o JSON puro", () => {
    expect(parseTaskTextResponse('{"name":"Daily","fields":{"P":"acme"}}', hints)).toEqual({
      name: "Daily",
      fields: { P: "acme" },
    });
  });

  it("acha o JSON dentro de cerca de código", () => {
    const raw = '```json\n{"name": "Daily", "fields": {"PS": "dev"}}\n```';
    expect(parseTaskTextResponse(raw, hints).fields).toEqual({ PS: "dev" });
  });

  it("acha o JSON no meio de prosa, com chave dentro de string", () => {
    const raw = 'Claro! {ok} Aqui está: {"name": "Fix {bug}", "fields": {}} Espero ter ajudado.';
    expect(parseTaskTextResponse(raw, hints)).toEqual({ name: "Fix {bug}", fields: {} });
  });

  it("descarta sigla desconhecida e valor que não é texto, e normaliza a caixa", () => {
    const raw = '{"name":"Daily","fields":{"p":"acme","XX":"1","C":7,"B":"  "}}';
    expect(parseTaskTextResponse(raw, hints).fields).toEqual({ P: "acme" });
  });

  it("aceita fields ausente e nome que não é texto", () => {
    expect(parseTaskTextResponse('{"name": null}', hints)).toEqual({ name: "", fields: {} });
  });

  it("lança TaskTextResponseError sem JSON", () => {
    expect(() => parseTaskTextResponse("não entendi", hints)).toThrow(TaskTextResponseError);
    expect(() => parseTaskTextResponse('{"name": "cortado', hints)).toThrow(TaskTextResponseError);
  });

  it("lança TaskTextResponseError quando fields não é objeto", () => {
    expect(() => parseTaskTextResponse('{"name":"x","fields":["P"]}', hints)).toThrow(
      TaskTextResponseError
    );
  });
});
