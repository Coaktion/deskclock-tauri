import { describe, it, expect } from "vitest";
import { actionLabel } from "@presentation/components/ActionChip";

/**
 * O nome é opcional, e é a **ausência** dele que precisa continuar funcionando:
 * toda ação gravada antes do campo existir vem sem ele, e o chip tem de escrever
 * o mesmo que escrevia — hostname na URL, nome do arquivo no caminho.
 */
describe("actionLabel", () => {
  it("nomeada, escreve o nome", () => {
    expect(
      actionLabel({ type: "open_url", value: "https://meet.google.com/abc", label: "Meet" })
    ).toBe("Meet");
  });

  it("nome só de espaços não conta como nome", () => {
    expect(
      actionLabel({ type: "open_url", value: "https://meet.google.com/abc", label: "  " })
    ).toBe("meet.google.com");
  });

  it("sem nome, a URL vira hostname sem o www", () => {
    expect(actionLabel({ type: "open_url", value: "https://www.monday.com/boards/1" })).toBe(
      "monday.com"
    );
  });

  it("sem nome e sem esquema, ainda resolve o hostname", () => {
    expect(actionLabel({ type: "open_url", value: "meet.google.com/abc" })).toBe("meet.google.com");
  });

  it("URL que não parseia cai no próprio valor", () => {
    expect(actionLabel({ type: "open_url", value: "http://" })).toBe("http://");
  });

  it("sem nome, o caminho vira o nome do arquivo", () => {
    expect(actionLabel({ type: "open_file", value: "/home/eduardo/notas.md" })).toBe("notas.md");
  });

  it("caminho do Windows resolve pela mesma regra", () => {
    expect(actionLabel({ type: "open_file", value: "C:\\Projetos\\ata.docx" })).toBe("ata.docx");
  });

  it("caminho terminado em barra cai no próprio valor", () => {
    expect(actionLabel({ type: "open_file", value: "/home/eduardo/" })).toBe("/home/eduardo/");
  });
});
