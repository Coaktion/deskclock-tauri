import { describe, it, expect } from "vitest";
import { buildResultMessage } from "@presentation/hooks/useTaskSendSelection";

/**
 * A frase do modal de envio. O caso que motivou o teste é o do meio: enquanto a
 * recusa de um grupo era exceção, um envio ao Monday com uma tarefa sem motivo
 * de não faturável mostrava "Não enviado ao Monday" em vermelho — com os demais
 * grupos já gravados no board.
 */
describe("buildResultMessage", () => {
  const clean = { refused: [], failed: [] };

  it("tudo enviado → verde, sem ressalva", () => {
    expect(buildResultMessage(3, clean)).toEqual({
      text: "3 grupo(s) enviado(s) com sucesso.",
      tone: "success",
    });
  });

  it("recusa parcial → amarelo, dizendo o que subiu e o que não", () => {
    const msg = buildResultMessage(2, {
      refused: ['"Reunião": informe o motivo de não faturável.'],
      failed: [],
    });
    expect(msg.tone).toBe("warning");
    expect(msg.text).toContain("2 grupo(s) enviado(s) com sucesso.");
    expect(msg.text).toContain("1 não subiu(ram)");
    expect(msg.text).toContain("informe o motivo");
  });

  it("falha técnica é vermelha mesmo com parte enviada", () => {
    // Recusa pede editar a tarefa; falha pede tentar de novo. Enquanto as duas
    // moravam no mesmo campo, queda de rede virava aviso amarelo.
    const msg = buildResultMessage(2, { refused: [], failed: ['"Daily": Failed to fetch.'] });
    expect(msg.tone).toBe("error");
    expect(msg.text).toContain("2 grupo(s) enviado(s) com sucesso.");
    expect(msg.text).toContain("1 falhou(ram)");
  });

  it("falha manda no tom quando há recusa junto", () => {
    const msg = buildResultMessage(1, { refused: ["a"], failed: ["b"] });
    expect(msg.tone).toBe("error");
    expect(msg.text).toContain("não subiu(ram)");
    expect(msg.text).toContain("falhou(ram)");
  });

  it("nada enviado → vermelho, só com os motivos", () => {
    const msg = buildResultMessage(0, { refused: ['"Reunião": informe o motivo.'], failed: [] });
    expect(msg.tone).toBe("error");
    expect(msg.text).not.toContain("com sucesso");
    expect(msg.text).toContain("informe o motivo");
  });

  it("nada enviado e nada pendente ainda diz algo", () => {
    // Sem o fallback a tela ficaria com uma linha vazia depois de clicar.
    expect(buildResultMessage(0, clean)).toEqual({
      text: "Nenhum grupo enviado.",
      tone: "error",
    });
  });
});
