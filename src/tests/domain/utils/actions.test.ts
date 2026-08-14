import { describe, it, expect, vi } from "vitest";
import {
  actionDestinationLabel,
  buildPlannedAction,
  executeActions,
  normalizeUrl,
  openUrlAction,
} from "@domain/utils/actions";
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

/**
 * O nome que a integração escreve é o **destino**, não a entidade de origem: a
 * planejada importada já nasce com o nome do evento, do item ou do ticket, e
 * nomear a ação com o mesmo texto faria o chip ecoar, uma linha acima, o nome
 * que o card do popup mostra logo abaixo.
 */
describe("actionDestinationLabel", () => {
  it("reconhece os destinos de reunião", () => {
    expect(actionDestinationLabel("https://meet.google.com/abc-defg-hij")).toBe("Meet");
    expect(actionDestinationLabel("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(actionDestinationLabel("https://teams.microsoft.com/l/meetup-join/x")).toBe("Teams");
    expect(actionDestinationLabel("https://teams.live.com/meet/123")).toBe("Teams");
  });

  it("separa o evento da Agenda da própria reunião, nas duas formas do link", () => {
    // É o par que o `conferenceLink ?? htmlLink` já distingue no código e que o
    // chip, escrevendo só o hostname, não separava. O `htmlLink` real da API v3
    // é `www.google.com/calendar/event`, e não `calendar.google.com`: sem a
    // entrada com `path`, o fallback nunca ganharia nome.
    expect(actionDestinationLabel("https://calendar.google.com/event?eid=x")).toBe("Google Agenda");
    expect(actionDestinationLabel("https://www.google.com/calendar/event?eid=x")).toBe(
      "Google Agenda"
    );
  });

  it("a entrada larga do google.com não engole o Meet", () => {
    // A regressão que a ordem de `DESTINATIONS` evita: `meet.google.com` termina
    // em `.google.com`, e sem o `path` a entrada da Agenda casaria com ela.
    expect(actionDestinationLabel("https://meet.google.com/abc")).toBe("Meet");
    expect(actionDestinationLabel("https://www.google.com/search?q=x")).toBeUndefined();
  });

  it("o subdomínio da conta cai no mesmo destino", () => {
    expect(actionDestinationLabel("https://aktienow.monday.com/boards/1/pulses/2")).toBe("Monday");
    expect(actionDestinationLabel("https://coaktion.zendesk.com/agent/tickets/42")).toBe("Zendesk");
  });

  it("o www não muda o destino, e a URL sem esquema também não", () => {
    expect(actionDestinationLabel("https://www.monday.com/boards/1")).toBe("Monday");
    expect(actionDestinationLabel("meet.google.com/abc")).toBe("Meet");
  });

  it("host desconhecido não ganha nome", () => {
    // Sem nome o chip deriva o rótulo do valor, que é o que ele já escrevia:
    // inventar um nome aqui duplicaria a derivação do `actionLabel`.
    expect(actionDestinationLabel("https://exemplo.com.br/pauta")).toBeUndefined();
  });

  it("URL que não parseia não ganha nome", () => {
    expect(actionDestinationLabel("http://")).toBeUndefined();
  });
});

describe("buildPlannedAction", () => {
  it("nome escrito entra aparado", () => {
    expect(buildPlannedAction("open_url", "https://x.com", "  Board  ")).toEqual({
      type: "open_url",
      value: "https://x.com",
      label: "Board",
    });
  });

  it("nome vazio ou só de espaços não vira chave", () => {
    // A invariante inteira do campo opcional. Gravar `label: ""` não quebraria o
    // chip — o `actionLabel` faz `trim()` e cai na derivação —, mas a linha da
    // lista renderizaria um span vazio, e nenhum teste de leitura veria isso.
    for (const label of [undefined, "", "   "]) {
      const action = buildPlannedAction("open_file", "/tmp/x", label);
      expect(action).toEqual({ type: "open_file", value: "/tmp/x" });
      expect("label" in action).toBe(false);
    }
  });
});

describe("openUrlAction", () => {
  it("sem URL, não há ação", () => {
    expect(openUrlAction(undefined)).toBeNull();
    expect(openUrlAction("")).toBeNull();
  });

  it("destino conhecido nasce nomeado", () => {
    expect(openUrlAction("https://meet.google.com/abc")).toEqual({
      type: "open_url",
      value: "https://meet.google.com/abc",
      label: "Meet",
    });
  });

  it("destino desconhecido nasce sem a chave, não com ela vazia", () => {
    const action = openUrlAction("https://exemplo.com.br/pauta");
    expect(action).toEqual({ type: "open_url", value: "https://exemplo.com.br/pauta" });
    expect(action && "label" in action).toBe(false);
  });
});
