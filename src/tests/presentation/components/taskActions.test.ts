import { describe, expect, it } from "vitest";
import { singleAction } from "@presentation/components/taskActions";

/**
 * O ⚡ tem dois comportamentos, e é esta função que os separa: com uma ação só
 * ele executa direto, e o painel existe para a escolha que só há a partir de
 * duas. Enterrada no JSX, a regra só se verificaria abrindo a tela.
 */
describe("singleAction", () => {
  const url = { type: "open_url", value: "https://meet.google.com/abc" } as const;
  const file = { type: "open_file", value: "/home/eduardo/ata.md" } as const;

  it("sem ação nenhuma, não há o que executar direto", () => {
    expect(singleAction([])).toBeNull();
  });

  it("com uma ação, devolve a própria ação", () => {
    expect(singleAction([url])).toBe(url);
  });

  it("o tipo da ação não muda a regra — arquivo também executa direto", () => {
    expect(singleAction([file])).toBe(file);
  });

  it("com duas ações, a escolha é do usuário e nada executa direto", () => {
    expect(singleAction([url, file])).toBeNull();
  });

  it("com mais de duas, continua sendo o painel", () => {
    expect(singleAction([url, file, url])).toBeNull();
  });
});
