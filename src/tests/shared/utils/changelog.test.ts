import { describe, it, expect } from "vitest";
import { extractVersionNotes } from "@shared/utils/changelog";
import changelog from "../../../../CHANGELOG.md?raw";
import pkg from "../../../../package.json";

const SAMPLE = `# Changelog

All notable changes to this project will be documented in this file.

### [2.0.1](https://github.com/o/r/compare/v2.0.0...v2.0.1) (2026-08-20)


### Features

* **tarefas:** item novo da 2.0.1

### Bug Fixes

* **overlay:** correção da 2.0.1

## [2.0.0](https://github.com/o/r/compare/v1.11.0...v2.0.0) (2026-08-14)


### BREAKING CHANGES

* **aparência:** mudança da 2.0.0

### [1.11.0](https://github.com/o/r/compare/v1.10.0...v1.11.0) (2026-08-01)

### Features

* último item do arquivo ([abc1234](https://github.com/o/r/commit/abc1234))
`;

describe("extractVersionNotes", () => {
  it("devolve a seção de uma versão com cabeçalho de patch (h3)", () => {
    const notes = extractVersionNotes(SAMPLE, "2.0.1");
    expect(notes).toBe(
      "### Features\n\n* **tarefas:** item novo da 2.0.1\n\n### Bug Fixes\n\n* **overlay:** correção da 2.0.1"
    );
  });

  it("não confunde o subtítulo ### Features com o cabeçalho de versão", () => {
    const notes = extractVersionNotes(SAMPLE, "2.0.1");
    expect(notes).toContain("### Bug Fixes");
    expect(notes).not.toContain("2.0.0");
  });

  it("devolve a seção de uma versão com cabeçalho de major (h2)", () => {
    expect(extractVersionNotes(SAMPLE, "2.0.0")).toBe(
      "### BREAKING CHANGES\n\n* **aparência:** mudança da 2.0.0"
    );
  });

  it("devolve a última seção do arquivo até o fim", () => {
    expect(extractVersionNotes(SAMPLE, "1.11.0")).toBe(
      "### Features\n\n* último item do arquivo ([abc1234](https://github.com/o/r/commit/abc1234))"
    );
  });

  it("aceita a versão com prefixo v", () => {
    expect(extractVersionNotes(SAMPLE, "v2.0.0")).toContain("BREAKING CHANGES");
  });

  it("devolve null para versão ausente", () => {
    expect(extractVersionNotes(SAMPLE, "9.9.9")).toBeNull();
  });

  it("não casa versão por prefixo (2.0.1 não é 2.0.10)", () => {
    expect(extractVersionNotes(SAMPLE, "2.0")).toBeNull();
    expect(extractVersionNotes(SAMPLE.replace("[2.0.1]", "[2.0.10]"), "2.0.1")).toBeNull();
  });

  it("devolve null para versão vazia ou seção sem conteúdo", () => {
    expect(extractVersionNotes(SAMPLE, "")).toBeNull();
    expect(extractVersionNotes("### [1.0.0](x) (2026-01-01)\n\n\n", "1.0.0")).toBeNull();
  });

  it("devolve corpo no formato que o ReleaseNotes lê: subtítulos ### e itens *", () => {
    const lines = extractVersionNotes(SAMPLE, "2.0.1")!
      .split("\n")
      .filter((l) => l.trim());
    expect(lines.every((l) => l.startsWith("### ") || l.startsWith("* "))).toBe(true);
    // Nenhum cabeçalho de versão vaza — o ReleaseNotes o mostraria como subtítulo.
    expect(lines.some((l) => /\[\d+\.\d+\.\d+\]\(/.test(l))).toBe(false);
  });

  it("o CHANGELOG.md do repositório traz as notas da versão do package.json", () => {
    expect(extractVersionNotes(changelog, pkg.version)).toBeTruthy();
  });
});
