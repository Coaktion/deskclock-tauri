import { describe, it, expect } from "vitest";
import {
  dailySummaryTitle,
  isDailySummaryCacheValid,
  type DailySummaryCache,
} from "@presentation/hooks/dailySummary";
import { localISO } from "../../helpers/localTime";
import { localDateISO } from "@shared/utils/time";

const HOJE = localDateISO(localISO(2026, 8, 27, 12));
const ONTEM = localDateISO(localISO(2026, 8, 26, 12));
const SEXTA = localDateISO(localISO(2026, 8, 21, 12));

function makeCache(overrides: Partial<DailySummaryCache> = {}): DailySummaryCache {
  return { dateISO: SEXTA, text: "Manhã em revisão de PR.", workspaceId: "ws-1", ...overrides };
}

describe("isDailySummaryCacheValid", () => {
  it("vale quando o dia resumido e o workspace são os mesmos", () => {
    expect(isDailySummaryCacheValid(makeCache(), SEXTA, "ws-1")).toBe(true);
  });

  it("não vale quando o último dia trabalhado passou a ser outro", () => {
    expect(isDailySummaryCacheValid(makeCache(), HOJE, "ws-1")).toBe(false);
  });

  it("não vale para outro workspace, mesmo no mesmo dia", () => {
    expect(isDailySummaryCacheValid(makeCache(), SEXTA, "ws-2")).toBe(false);
  });

  it("não vale quando nunca houve resumo guardado", () => {
    const vazio = makeCache({ dateISO: "", text: "", workspaceId: "" });
    expect(isDailySummaryCacheValid(vazio, SEXTA, "ws-1")).toBe(false);
  });

  it("texto só de espaço não passa por resumo guardado", () => {
    expect(isDailySummaryCacheValid(makeCache({ text: "   " }), SEXTA, "ws-1")).toBe(false);
  });
});

describe("dailySummaryTitle", () => {
  it("usa a palavra quando o dia resumido é hoje", () => {
    expect(dailySummaryTitle(HOJE, HOJE)).toBe("Resumo de hoje");
  });

  it("usa a palavra quando o dia resumido é ontem", () => {
    expect(dailySummaryTitle(ONTEM, HOJE)).toBe("Resumo de ontem");
  });

  it("escreve a data por extenso quando o dia é mais antigo", () => {
    expect(dailySummaryTitle(SEXTA, HOJE)).toBe("Resumo de sex. 21 de ago. de 2026");
  });

  it("sem dia resolvido, o título não afirma dia nenhum", () => {
    expect(dailySummaryTitle(null, HOJE)).toBe("Resumo do dia");
  });
});
