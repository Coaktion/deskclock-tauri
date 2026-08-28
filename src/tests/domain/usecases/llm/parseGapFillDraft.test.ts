import { describe, expect, it } from "vitest";

import { parseGapFillDraft } from "@domain/usecases/llm/parseGapFillDraft";

const IDS = ["t1", "t2"];

function answer(...items: unknown[]): string {
  return JSON.stringify({ tarefas: items });
}

describe("parseGapFillDraft", () => {
  it("lê nome de projeto e de categoria por tarefa", () => {
    const { proposals } = parseGapFillDraft(
      answer({ id: "t1", projeto: "Aktie", categoria: "Reunião" }),
      IDS
    );
    expect(proposals).toEqual([
      { id: "t1", projectName: "Aktie", categoryName: "Reunião", fieldValues: {} },
    ]);
  });

  it("lê os campos personalizados por rótulo", () => {
    const { proposals } = parseGapFillDraft(
      answer({ id: "t2", campos: { Etapa: "Discovery" } }),
      IDS
    );
    expect(proposals[0].fieldValues).toEqual({ Etapa: "Discovery" });
  });

  it("apara cerca de markdown e prosa em volta", () => {
    const raw = "Aqui está:\n```json\n" + answer({ id: "t1", projeto: "Aktie" }) + "\n```\npronto";
    expect(parseGapFillDraft(raw, IDS).proposals).toHaveLength(1);
  });

  it("descarta o id que não estava na lista enviada", () => {
    // O modelo inventa id, e um id inventado aplicado a esmo escreveria numa
    // tarefa que ninguém revisou.
    const { proposals, discarded } = parseGapFillDraft(
      answer({ id: "t9", projeto: "Aktie" }, { id: "t1", projeto: "Aktie" }),
      IDS
    );
    expect(proposals.map((p) => p.id)).toEqual(["t1"]);
    expect(discarded).toBe(1);
  });

  it("descarta o item que não propõe nada", () => {
    const { proposals, discarded } = parseGapFillDraft(answer({ id: "t1" }), IDS);
    expect(proposals).toEqual([]);
    expect(discarded).toBe(1);
  });

  it("ignora valor que não é texto", () => {
    const { proposals } = parseGapFillDraft(
      answer({ id: "t1", projeto: 42, categoria: "Reunião", campos: { Etapa: true } }),
      IDS
    );
    expect(proposals[0]).toEqual({ id: "t1", categoryName: "Reunião", fieldValues: {} });
  });

  it("devolve lista vazia quando não há JSON legível", () => {
    expect(parseGapFillDraft("não consegui", IDS)).toEqual({ proposals: [], discarded: 0 });
  });

  it("fica com a primeira proposta quando o mesmo id vem duas vezes", () => {
    const { proposals, discarded } = parseGapFillDraft(
      answer({ id: "t1", projeto: "Aktie" }, { id: "t1", projeto: "DeskClock" }),
      IDS
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].projectName).toBe("Aktie");
    expect(discarded).toBe(1);
  });
});
