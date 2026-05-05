import { describe, it, expect, vi } from "vitest";
import { normalizeUrl, executeActions } from "@domain/utils/actions";
import type { PlannedTaskAction } from "@domain/entities/PlannedTask";

describe("normalizeUrl", () => {
  it("adiciona https:// quando não há scheme", () => {
    expect(normalizeUrl("example.com")).toBe("https://example.com");
  });

  it("preserva https:// existente", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("preserva http:// existente", () => {
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("adiciona https:// em string vazia", () => {
    expect(normalizeUrl("")).toBe("https://");
  });

  it("não duplica o prefixo", () => {
    expect(normalizeUrl("https://https://example.com")).toBe("https://https://example.com");
  });
});

describe("executeActions", () => {
  function makeOpener() {
    return {
      openUrl: vi.fn(async () => undefined),
      openPath: vi.fn(async () => undefined),
    };
  }

  it("chama openUrl com URL normalizada para ação open_url", async () => {
    const opener = makeOpener();
    const actions: PlannedTaskAction[] = [{ type: "open_url", value: "example.com" }];
    await executeActions(actions, opener);
    expect(opener.openUrl).toHaveBeenCalledWith("https://example.com");
  });

  it("chama openUrl preservando https:// já existente", async () => {
    const opener = makeOpener();
    const actions: PlannedTaskAction[] = [{ type: "open_url", value: "https://app.com/path" }];
    await executeActions(actions, opener);
    expect(opener.openUrl).toHaveBeenCalledWith("https://app.com/path");
  });

  it("chama openPath com o valor exato para ação open_file", async () => {
    const opener = makeOpener();
    const actions: PlannedTaskAction[] = [{ type: "open_file", value: "/home/user/doc.pdf" }];
    await executeActions(actions, opener);
    expect(opener.openPath).toHaveBeenCalledWith("/home/user/doc.pdf");
  });

  it("executa múltiplas ações em sequência", async () => {
    const opener = makeOpener();
    const actions: PlannedTaskAction[] = [
      { type: "open_url", value: "https://app.com" },
      { type: "open_file", value: "/home/user/doc.pdf" },
    ];
    await executeActions(actions, opener);
    expect(opener.openUrl).toHaveBeenCalledTimes(1);
    expect(opener.openPath).toHaveBeenCalledTimes(1);
  });

  it("não chama o opener para array vazio", async () => {
    const opener = makeOpener();
    await executeActions([], opener);
    expect(opener.openUrl).not.toHaveBeenCalled();
    expect(opener.openPath).not.toHaveBeenCalled();
  });

  it("não chama openPath para open_url e vice-versa", async () => {
    const opener = makeOpener();
    const actions: PlannedTaskAction[] = [{ type: "open_url", value: "https://app.com" }];
    await executeActions(actions, opener);
    expect(opener.openPath).not.toHaveBeenCalled();
  });
});
