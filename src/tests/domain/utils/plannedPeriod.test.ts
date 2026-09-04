import { describe, expect, it } from "vitest";
import { isPeriodInverted, isPeriodScheduleValid } from "@domain/utils/plannedPeriod";

describe("isPeriodScheduleValid", () => {
  it("aceita período com as duas pontas", () => {
    expect(isPeriodScheduleValid("2026-01-01", "2026-12-31")).toBe(true);
    expect(isPeriodScheduleValid("2026-01-01", "2026-01-01")).toBe(true);
  });

  it("aceita fim vazio — é o período que não termina", () => {
    // `period_end IS NULL` é ramo explícito das quatro consultas do repositório:
    // a planejada aparece do início em diante.
    expect(isPeriodScheduleValid("2026-01-01", "")).toBe(true);
  });

  it("recusa início vazio, mesmo com fim preenchido", () => {
    // `period_start <= $1` com NULL não casa em consulta nenhuma — a planejada
    // sumiria de todas as telas sem estar excluída.
    expect(isPeriodScheduleValid("", "2026-12-31")).toBe(false);
    expect(isPeriodScheduleValid("", "")).toBe(false);
  });

  it("recusa fim antes do início", () => {
    expect(isPeriodScheduleValid("2026-12-31", "2026-01-01")).toBe(false);
  });
});

describe("isPeriodInverted", () => {
  it("só acusa erro com as duas pontas preenchidas", () => {
    // Com uma ponta faltando o período está incompleto, não errado — pintar a
    // borda de vermelho ali acusa um erro que a pessoa não cometeu.
    expect(isPeriodInverted("2026-12-31", "")).toBe(false);
    expect(isPeriodInverted("", "2026-01-01")).toBe(false);
  });

  it("acusa quando o fim é antes do início", () => {
    expect(isPeriodInverted("2026-12-31", "2026-01-01")).toBe(true);
  });

  it("não acusa quando as pontas coincidem", () => {
    expect(isPeriodInverted("2026-01-01", "2026-01-01")).toBe(false);
  });
});
