import { describe, it, expect } from "vitest";
import {
  parseCalendarMetadata,
  findByNameCaseInsensitive,
} from "@shared/utils/calendarMetadata";

describe("parseCalendarMetadata", () => {
  it("extrai projeto e categoria de descrição bem formada", () => {
    const result = parseCalendarMetadata("Projeto: Tech Interno2\nCategoria: Reunião do Time");
    expect(result.projectName).toBe("Tech Interno2");
    expect(result.categoryName).toBe("Reunião do Time");
  });

  it("é case-insensitive nas chaves", () => {
    const result = parseCalendarMetadata("PROJETO: Meu Projeto\ncategoria: Dev");
    expect(result.projectName).toBe("Meu Projeto");
    expect(result.categoryName).toBe("Dev");
  });

  it("retorna undefined para campos ausentes", () => {
    const result = parseCalendarMetadata("Projeto: Apenas Projeto");
    expect(result.projectName).toBe("Apenas Projeto");
    expect(result.categoryName).toBeUndefined();
  });

  it("retorna objeto vazio para descrição undefined", () => {
    const result = parseCalendarMetadata(undefined);
    expect(result).toEqual({});
  });

  it("retorna objeto vazio para descrição sem metadados", () => {
    const result = parseCalendarMetadata("Reunião de alinhamento quinzenal com o time.");
    expect(result.projectName).toBeUndefined();
    expect(result.categoryName).toBeUndefined();
  });

  it("lida com espaços extras em volta do valor", () => {
    const result = parseCalendarMetadata("Projeto:   Valor com espaços   ");
    expect(result.projectName).toBe("Valor com espaços");
  });

  it("extrai Faturável: Sim como true", () => {
    const result = parseCalendarMetadata("Faturável: Sim");
    expect(result.billable).toBe(true);
  });

  it("extrai Faturável: Não como false", () => {
    const result = parseCalendarMetadata("faturável: não");
    expect(result.billable).toBe(false);
  });

  it("suporta outros textos na descrição além dos metadados", () => {
    const desc = "Reunião importante.\n\nProjeto: Alpha\nCategoria: Gestão\n\nVer notas no Notion.";
    const result = parseCalendarMetadata(desc);
    expect(result.projectName).toBe("Alpha");
    expect(result.categoryName).toBe("Gestão");
  });
});

describe("findByNameCaseInsensitive", () => {
  const items = [
    { id: "1", name: "Tech Interno2" },
    { id: "2", name: "Reunião do Time" },
    { id: "3", name: "Dev" },
  ];

  it("encontra por nome exato", () => {
    expect(findByNameCaseInsensitive("Tech Interno2", items)?.id).toBe("1");
  });

  it("encontra com caixa diferente", () => {
    expect(findByNameCaseInsensitive("tech interno2", items)?.id).toBe("1");
    expect(findByNameCaseInsensitive("TECH INTERNO2", items)?.id).toBe("1");
  });

  it("retorna null se não encontrar", () => {
    expect(findByNameCaseInsensitive("Projeto Inexistente", items)).toBeNull();
  });

  it("retorna null para query undefined", () => {
    expect(findByNameCaseInsensitive(undefined, items)).toBeNull();
  });

  it("retorna null para query vazia", () => {
    expect(findByNameCaseInsensitive("", items)).toBeNull();
  });

  it("ignora espaços extras na query", () => {
    expect(findByNameCaseInsensitive("  dev  ", items)?.id).toBe("3");
  });
});
