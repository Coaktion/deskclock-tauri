import { describe, it, expect } from "vitest";
import {
  BOARD_SCHEMA_TTL_DAYS,
  shouldReadBoardSchema,
} from "@domain/usecases/monday/mondayBoardSchemaPolicy";
import { localISO } from "../../../helpers/localTime";

const NOW = localISO(2026, 8, 6, 9);

type Cached = Parameters<typeof shouldReadBoardSchema>[0]["cached"];

// Overrides nomeados, e não posicionais: `statusLabels` tem três estados e o
// `undefined` é um deles — um default o tornaria inexprimível pelo helper.
function cached(overrides: Partial<NonNullable<Cached>> = {}): NonNullable<Cached> {
  return { mondayBoardId: "b1", statusLabels: [], ...overrides };
}

describe("shouldReadBoardSchema", () => {
  it("lê o board que aparece pela primeira vez", () => {
    expect(shouldReadBoardSchema({ boardId: "b1", nowISO: NOW })).toBe(true);
  });

  it("não lê o board cuja marca ainda vale", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: localISO(2026, 8, 5, 9) }),
        nowISO: NOW,
      })
    ).toBe(false);
  });

  it("lê o board cuja marca venceu", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: localISO(2026, 7, 29, 8) }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  // O vencimento é no fim do prazo, não depois dele: sem o `>=`, o board lido
  // exatamente há uma semana seguiria em cache por mais um tique.
  it("lê o board no instante em que o prazo fecha", () => {
    const readAt = new Date(Date.parse(NOW) - BOARD_SCHEMA_TTL_DAYS * 24 * 60 * 60 * 1000);
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: readAt.toISOString() }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  // Vínculo gravado antes do cache dos rótulos de Status volta sem eles, e sem
  // eles o envio não sabe se "Completed" existe no board. A releitura é o
  // conserto automático: a varredura diária de projetos regrava o mapeamento.
  it("lê o vínculo sem os rótulos de Status, gravado antes deste cache", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: NOW, statusLabels: undefined }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  // Board sem coluna Status resolve para lista vazia, que é estado final: relê-lo
  // por isso faria a leitura mais cara da integração voltar a ser diária.
  it("não lê o board cujos rótulos de Status resolveram em lista vazia", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: NOW, statusLabels: [] }),
        nowISO: NOW,
      })
    ).toBe(false);
  });

  it("lê o vínculo sem marca, gravado antes deste cache", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: undefined }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  // `Date.parse` de lixo é `NaN`, e toda comparação com `NaN` é falsa: sem o teste
  // explícito, uma marca corrompida no JSON da config congelaria o board no cache
  // para sempre.
  it("lê o board cuja marca não é uma data", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: "ontem" }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  it("lê o board quando o destino mudou, por mais fresca que seja a marca", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b-novo",
        cached: cached({ schemaReadAtISO: NOW, mondayBoardId: "b-antigo" }),
        nowISO: NOW,
      })
    ).toBe(true);
  });

  it("lê tudo quando o import é forçado", () => {
    expect(
      shouldReadBoardSchema({
        boardId: "b1",
        cached: cached({ schemaReadAtISO: NOW }),
        nowISO: NOW,
        force: true,
      })
    ).toBe(true);
  });

  // 14 dos 62 itens do Portfólio estão sem quadro: não há board a ler, e nem o
  // clique em "Atualizar" inventa um.
  it("não lê nada do projeto sem quadro de destino, nem forçado", () => {
    expect(shouldReadBoardSchema({ boardId: "", nowISO: NOW })).toBe(false);
    expect(shouldReadBoardSchema({ boardId: "", nowISO: NOW, force: true })).toBe(false);
  });
});
