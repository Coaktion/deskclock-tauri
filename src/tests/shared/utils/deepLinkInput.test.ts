import { describe, it, expect } from "vitest";
import { readDeepLinkInput } from "../../../shared/utils/deepLinkInput";

describe("readDeepLinkInput — validação local do link colado", () => {
  it("campo vazio não é campo errado: sem mensagem, e a ação fica desligada", () => {
    const read = readDeepLinkInput("   ");
    expect(read.ready).toBe(false);
    expect(read.error).toBeNull();
  });

  it("recusa texto que não começa com o esquema do app", () => {
    const read = readDeepLinkInput("https://exemplo.com/tarefa");
    expect(read.ready).toBe(false);
    expect(read.error).toContain("deskclock://");
  });

  it("recusa o prefixo sem destino", () => {
    expect(readDeepLinkInput("deskclock://").ready).toBe(false);
  });

  it("apara os espaços das pontas antes de entregar a URL", () => {
    const read = readDeepLinkInput("  deskclock://navigate/history  ");
    expect(read.url).toBe("deskclock://navigate/history");
    expect(read.ready).toBe(true);
  });

  it("aceita qualquer rota do app sem interpretá-la — quem decide é o Rust", () => {
    for (const url of [
      "deskclock://navigate/history",
      "deskclock://task/start?name=Revisar",
      "deskclock://retroactive",
      "deskclock://rota-que-o-ts-nao-conhece",
    ]) {
      const read = readDeepLinkInput(url);
      expect(read.ready, url).toBe(true);
      expect(read.error, url).toBeNull();
      expect(read.sharedName, url).toBeNull();
    }
  });

  it("no link de tarefa compartilhada lê o nome como confirmação", () => {
    const read = readDeepLinkInput("deskclock://task/share?name=Revisar%20proposta&project=A");
    expect(read.ready).toBe(true);
    expect(read.sharedName).toBe("Revisar proposta");
  });

  it("recusa link de tarefa compartilhada sem nome", () => {
    const read = readDeepLinkInput("deskclock://task/share?project=A");
    expect(read.ready).toBe(false);
    expect(read.error).toContain("nome");
  });

  it("não confunde outra rota que começa igual com task/share", () => {
    const read = readDeepLinkInput("deskclock://task/sharedrive");
    expect(read.ready).toBe(true);
    expect(read.sharedName).toBeNull();
  });
});
