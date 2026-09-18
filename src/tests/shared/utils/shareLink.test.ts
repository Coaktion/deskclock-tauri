import { describe, it, expect } from "vitest";
import {
  buildShareLink,
  parseShareLink,
  parseShareParams,
  type SharedTaskPayload,
} from "../../../shared/utils/shareLink";

function makePayload(overrides: Partial<SharedTaskPayload> = {}): SharedTaskPayload {
  return {
    name: "Revisar proposta",
    projectName: "Projeto A",
    categoryName: "Desenvolvimento",
    billable: true,
    startTime: "09:00",
    endTime: "10:30",
    customValues: {},
    ...overrides,
  };
}

describe("buildShareLink / parseShareLink — ida e volta", () => {
  it("preserva acento, espaço, & , # e + no nome, no projeto e no campo personalizado", () => {
    const payload = makePayload({
      name: "Reunião & café #1 + retro",
      projectName: "Educação & Saúde #2",
      categoryName: "Análise + Suporte",
      customValues: { "Descrição & nota": "valor #3 + extra & fim" },
    });

    const link = buildShareLink(payload);
    expect(parseShareLink(link)).toEqual(payload);
  });

  it("não inclui na query os campos ausentes ou vazios", () => {
    const link = buildShareLink({
      name: "Só o nome",
      billable: true,
      customValues: {},
      projectName: "",
      categoryName: undefined,
    });

    expect(link).toBe("deskclock://task/share?name=S%C3%B3%20o%20nome");
    expect(parseShareLink(link)).toEqual({
      name: "Só o nome",
      projectName: undefined,
      categoryName: undefined,
      billable: true,
      startTime: undefined,
      endTime: undefined,
      customValues: {},
    });
  });

  it("trata rótulo de campo personalizado com ponto: só o primeiro cf. é prefixo", () => {
    const payload = makePayload({ customValues: { "N. do ticket": "AKT-42" } });
    const link = buildShareLink(payload);

    expect(link).toContain("cf.N.%20do%20ticket=AKT-42");
    expect(parseShareLink(link)?.customValues).toEqual({ "N. do ticket": "AKT-42" });
  });
});

describe("parseShareParams — billable", () => {
  it("assume true quando billable está ausente", () => {
    expect(parseShareParams({ name: "Tarefa" })?.billable).toBe(true);
  });

  it("é false apenas com billable=false", () => {
    expect(parseShareParams({ name: "Tarefa", billable: "false" })?.billable).toBe(false);
    expect(parseShareParams({ name: "Tarefa", billable: "true" })?.billable).toBe(true);
  });
});

describe("parseShareParams — descartes silenciosos", () => {
  it.each(["25:00", "14:5", "abc", "9:00", "23:60", ""])(
    "descarta a hora inválida %j e mantém o resto do payload",
    (invalid) => {
      const payload = parseShareParams({
        name: "Tarefa",
        project: "Projeto A",
        start: invalid,
        end: "18:00",
      });

      expect(payload).toEqual({
        name: "Tarefa",
        projectName: "Projeto A",
        categoryName: undefined,
        billable: true,
        startTime: undefined,
        endTime: "18:00",
        customValues: {},
      });
    }
  );

  it("aceita os extremos válidos 00:00 e 23:59", () => {
    const payload = parseShareParams({ name: "Tarefa", start: "00:00", end: "23:59" });
    expect(payload?.startTime).toBe("00:00");
    expect(payload?.endTime).toBe("23:59");
  });

  it("ignora chave desconhecida — recorrência, id, workspace, actions", () => {
    const payload = parseShareParams({
      name: "Tarefa",
      recurrence: "weekly",
      id: "123",
      workspace: "Aktie",
      actions: "start",
      scheduledFor: "2026-09-18",
    });

    expect(payload).toEqual({
      name: "Tarefa",
      projectName: undefined,
      categoryName: undefined,
      billable: true,
      startTime: undefined,
      endTime: undefined,
      customValues: {},
    });
  });
});

describe("links que não servem", () => {
  it("devolve null com esquema errado", () => {
    expect(parseShareLink("https://task/share?name=Tarefa")).toBeNull();
    expect(parseShareLink("deskclockx://task/share?name=Tarefa")).toBeNull();
  });

  it("devolve null com caminho errado", () => {
    expect(parseShareLink("deskclock://task/import?name=Tarefa")).toBeNull();
    expect(parseShareLink("deskclock://share?name=Tarefa")).toBeNull();
    expect(parseShareLink("deskclock://task/share/extra?name=Tarefa")).toBeNull();
  });

  it("devolve null sem name", () => {
    expect(parseShareLink("deskclock://task/share?project=Projeto%20A")).toBeNull();
    expect(parseShareLink("deskclock://task/share?name=%20%20")).toBeNull();
    expect(parseShareLink("deskclock://task/share")).toBeNull();
    expect(parseShareParams({ project: "Projeto A" })).toBeNull();
  });
});

describe("parseShareParams e parseShareLink concordam", () => {
  it("produzem o mesmo payload para a mesma entrada", () => {
    const params: Record<string, string> = {
      name: "Reunião & café",
      project: "Projeto A+",
      category: "Análise",
      billable: "false",
      start: "08:15",
      end: "25:00",
      "cf.N. do ticket": "AKT #7",
      unknown: "ignorado",
    };

    const link = [
      "deskclock://task/share?",
      Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&"),
    ].join("");

    expect(parseShareLink(link)).toEqual(parseShareParams(params));
    expect(parseShareLink(link)).toEqual({
      name: "Reunião & café",
      projectName: "Projeto A+",
      categoryName: "Análise",
      billable: false,
      startTime: "08:15",
      endTime: undefined,
      customValues: { "N. do ticket": "AKT #7" },
    });
  });
});
