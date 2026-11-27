import { describe, it, expect } from "vitest";
import { buildTaskFieldHints } from "@domain/usecases/llm/taskText/buildTaskFieldHints";
import { parseSiglaText } from "@domain/usecases/llm/taskText/parseSiglaText";
import { REASON_FIELD, STAGE_FIELD, makeCatalog } from "./fixtures";

const hints = buildTaskFieldHints([STAGE_FIELD, REASON_FIELD], makeCatalog());

describe("parseSiglaText", () => {
  it("separa o nome e várias siglas", () => {
    expect(parseSiglaText("Alinhamento sprint P=tech int C=dev nb PS=dev", hints)).toEqual({
      name: "Alinhamento sprint",
      fields: { P: "tech int", C: "dev nb", PS: "dev" },
    });
  });

  it("apara separadores entre os valores", () => {
    expect(parseSiglaText("Daily / P= Tech interno / C= Meeting, B= nb; NBR=peer", hints)).toEqual({
      name: "Daily",
      fields: { P: "Tech interno", C: "Meeting", B: "nb", NBR: "peer" },
    });
  });

  it("aceita sigla em minúscula e devolve na forma da instrução", () => {
    expect(parseSiglaText("Daily p=tech ps=dev", hints)?.fields).toEqual({ P: "tech", PS: "dev" });
  });

  it("trata sigla desconhecida como texto", () => {
    expect(parseSiglaText("Deploy X=1 P=acme TOP=3", hints)).toEqual({
      name: "Deploy X=1",
      fields: { P: "acme TOP=3" },
    });
  });

  it("devolve null quando não há sigla conhecida", () => {
    expect(parseSiglaText("Alinhamento com o time de dados", hints)).toBeNull();
    expect(parseSiglaText("Versão API=2", hints)).toBeNull();
  });

  it("aceita texto que começa pela sigla, com nome vazio", () => {
    expect(parseSiglaText("P=acme", hints)).toEqual({ name: "", fields: { P: "acme" } });
  });

  it("a sigla repetida fica com o último valor e a vazia não entra", () => {
    expect(parseSiglaText("Daily P=acme P=tech C=", hints)?.fields).toEqual({ P: "tech" });
  });
});
