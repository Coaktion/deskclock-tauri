import { describe, it, expect } from "vitest";
import { actionLabel } from "@presentation/components/ActionChip";

/**
 * Três degraus, e é a ordem entre eles que este arquivo trava: o nome gravado, o
 * destino derivado do host, e o rótulo cru do valor. A ação **sem nome** é a que
 * precisa continuar funcionando — é toda a que foi criada antes do campo existir,
 * e ela nunca vai ganhar `label`.
 */
describe("actionLabel", () => {
  it("nomeada, o nome vence o destino derivado", () => {
    expect(
      actionLabel({ type: "open_url", value: "https://meet.google.com/abc", label: "Daily" })
    ).toBe("Daily");
  });

  it("nome só de espaços não conta como nome", () => {
    expect(
      actionLabel({ type: "open_url", value: "https://meet.google.com/abc", label: "  " })
    ).toBe("Meet");
  });

  it("sem nome, o host conhecido vira o destino por extenso", () => {
    expect(actionLabel({ type: "open_url", value: "https://www.monday.com/boards/1" })).toBe(
      "Monday"
    );
  });

  it("o htmlLink da Agenda é destino, não hostname", () => {
    expect(
      actionLabel({ type: "open_url", value: "https://www.google.com/calendar/event?eid=abc" })
    ).toBe("Google Agenda");
  });

  it("sem nome e sem esquema, ainda reconhece o destino", () => {
    expect(actionLabel({ type: "open_url", value: "meet.google.com/abc" })).toBe("Meet");
  });

  it("host desconhecido cai no hostname sem o www", () => {
    expect(actionLabel({ type: "open_url", value: "https://www.exemplo.com.br/x" })).toBe(
      "exemplo.com.br"
    );
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
