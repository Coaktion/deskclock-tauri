import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig, ConfigContextValue } from "@presentation/contexts/ConfigContext";

// Mock do GoogleTokenManager para isolar da rede
vi.mock("@infra/integrations/google/GoogleTokenManager", () => ({
  GoogleTokenManager: vi.fn().mockImplementation(() => ({
    getValidAccessToken: vi.fn().mockResolvedValue("test-token"),
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { GoogleCalendarImporter } = await import(
  "@infra/integrations/GoogleCalendarImporter"
);

function makeConfig(): ConfigContextValue {
  return {
    isLoaded: true,
    loadError: null,
    get: vi.fn(<K extends keyof AppConfig>(_key: K) => "" as AppConfig[K]),
    set: vi.fn(),
  };
}

type Importer = InstanceType<typeof GoogleCalendarImporter>;

// Acessa mapEvent via cast para testar o método privado diretamente
function callMapEvent(importer: Importer, event: unknown) {
  return (importer as unknown as { mapEvent(e: unknown): unknown }).mapEvent(event);
}

describe("GoogleCalendarImporter", () => {
  let importer: Importer;

  beforeEach(() => {
    vi.clearAllMocks();
    importer = new GoogleCalendarImporter(makeConfig());
  });

  describe("mapEvent — evento com horário", () => {
    const timedEvent = {
      id: "evt-1",
      summary: "Reunião de planning",
      start: { dateTime: "2026-04-15T09:00:00-03:00" },
      end: { dateTime: "2026-04-15T10:00:00-03:00" },
    };

    it("mapeia id e título corretamente", () => {
      const result = callMapEvent(importer, timedEvent) as Record<string, unknown>;
      expect(result.id).toBe("evt-1");
      expect(result.title).toBe("Reunião de planning");
    });

    it("allDay é false para evento com horário", () => {
      const result = callMapEvent(importer, timedEvent) as Record<string, unknown>;
      expect(result.allDay).toBe(false);
    });

    it("extrai date no formato AAAA-MM-DD do fuso local", () => {
      const result = callMapEvent(importer, timedEvent) as Record<string, unknown>;
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("extrai startTime e endTime no formato HH:MM", () => {
      const result = callMapEvent(importer, timedEvent) as Record<string, unknown>;
      expect(result.startTime).toMatch(/^\d{2}:\d{2}$/);
      expect(result.endTime).toMatch(/^\d{2}:\d{2}$/);
    });

    it("inclui recurringEventId quando presente", () => {
      const recurring = { ...timedEvent, recurringEventId: "base-123" };
      const result = callMapEvent(importer, recurring) as Record<string, unknown>;
      expect(result.recurringEventId).toBe("base-123");
    });
  });

  describe("mapEvent — evento de dia inteiro", () => {
    const allDayEvent = {
      id: "evt-2",
      summary: "Feriado",
      start: { date: "2026-04-21" },
      end: { date: "2026-04-22" },
    };

    it("allDay é true para evento sem dateTime", () => {
      const result = callMapEvent(importer, allDayEvent) as Record<string, unknown>;
      expect(result.allDay).toBe(true);
    });

    it("usa start.date como date", () => {
      const result = callMapEvent(importer, allDayEvent) as Record<string, unknown>;
      expect(result.date).toBe("2026-04-21");
    });

    it("não tem startTime nem endTime", () => {
      const result = callMapEvent(importer, allDayEvent) as Record<string, unknown>;
      expect(result).not.toHaveProperty("startTime");
      expect(result).not.toHaveProperty("endTime");
    });

    it("usa '(sem título)' quando summary está ausente", () => {
      const noTitle = { ...allDayEvent, summary: undefined };
      const result = callMapEvent(importer, noTitle) as Record<string, unknown>;
      expect(result.title).toBe("(sem título)");
    });
  });

  describe("getEvents — filtragem de eventos", () => {
    function mockApiResponse(items: unknown[]) {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ items }),
      });
    }

    const baseEvent = {
      id: "evt-ok",
      summary: "Evento válido",
      start: { dateTime: "2026-04-15T09:00:00Z" },
      end: { dateTime: "2026-04-15T10:00:00Z" },
      status: "confirmed",
    };

    it("retorna eventos válidos", async () => {
      mockApiResponse([baseEvent]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe("Evento válido");
    });

    it("filtra eventos com status cancelled", async () => {
      mockApiResponse([{ ...baseEvent, status: "cancelled" }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("filtra eventos com summary vazio", async () => {
      mockApiResponse([{ ...baseEvent, summary: "   " }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("filtra eventos com summary ausente", async () => {
      mockApiResponse([{ ...baseEvent, summary: undefined }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("filtra eventos do tipo workingLocation", async () => {
      mockApiResponse([{ ...baseEvent, eventType: "workingLocation" }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("filtra eventos do tipo outOfOffice", async () => {
      mockApiResponse([{ ...baseEvent, eventType: "outOfOffice" }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("filtra eventos do tipo focusTime", async () => {
      mockApiResponse([{ ...baseEvent, eventType: "focusTime" }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });

    it("preserva eventos com eventType desconhecido", async () => {
      mockApiResponse([{ ...baseEvent, eventType: "default" }]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(1);
    });

    it("lança erro quando a API retorna erro HTTP", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({ error: { message: "Sem permissão" } }),
      });
      await expect(
        importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z")
      ).rejects.toThrow("Sem permissão");
    });

    it("retorna lista vazia quando items é undefined", async () => {
      mockApiResponse([]);
      const events = await importer.getEvents("2026-04-14T00:00:00Z", "2026-04-21T00:00:00Z");
      expect(events).toHaveLength(0);
    });
  });
});
