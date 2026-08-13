import { describe, it, expect } from "vitest";
import { actionDestinationLabel, openUrlAction } from "@domain/utils/actions";

/**
 * O nome que a integração escreve é o **destino**, não a entidade: a planejada
 * importada já nasce com o nome do evento ou do item, e nomear a ação com o
 * mesmo texto faria o chip ecoar, uma linha acima, o nome que o card do popup
 * mostra logo abaixo.
 */
describe("actionDestinationLabel", () => {
  it("reconhece os destinos de reunião", () => {
    expect(actionDestinationLabel("https://meet.google.com/abc-defg-hij")).toBe("Meet");
    expect(actionDestinationLabel("https://us02web.zoom.us/j/123")).toBe("Zoom");
    expect(actionDestinationLabel("https://teams.microsoft.com/l/meetup-join/x")).toBe("Teams");
    expect(actionDestinationLabel("https://teams.live.com/meet/123")).toBe("Teams");
  });

  it("separa o evento da Agenda da própria reunião", () => {
    // É o par que o `conferenceLink ?? htmlLink` já distingue no código e que o
    // chip, escrevendo só o hostname, não separava.
    expect(actionDestinationLabel("https://calendar.google.com/event?eid=x")).toBe("Google Agenda");
  });

  it("o subdomínio da conta do Monday cai no mesmo destino", () => {
    expect(actionDestinationLabel("https://aktienow.monday.com/boards/1/pulses/2")).toBe("Monday");
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
