import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import { IntegrationsProvider, useIntegrations } from "@presentation/contexts/IntegrationsContext";

vi.mock("@infra/integrations/GoogleCalendarImporter", () => ({
  GoogleCalendarImporter: vi.fn(() => ({})),
}));
vi.mock("@infra/integrations/GoogleSheetsTaskSender", () => ({
  GoogleSheetsTaskSender: vi.fn(() => ({})),
}));
vi.mock("@infra/integrations/ClockifyTaskSender", () => ({
  ClockifyTaskSender: vi.fn(() => ({})),
}));
vi.mock("@infra/integrations/ZendeskTicketImporter", () => ({
  ZendeskTicketImporter: vi.fn(() => ({})),
}));
vi.mock("@infra/integrations/clockify/ClockifyClient", () => ({
  ClockifyClient: vi.fn(() => ({})),
}));
vi.mock("@presentation/contexts/ConfigContext", () => ({
  useAppConfig: () => ({
    isLoaded: true,
    get: vi.fn(() => ""),
    set: vi.fn(),
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <IntegrationsProvider>{children}</IntegrationsProvider>;
}

describe("IntegrationsContext", () => {
  it("lança erro quando usado fora do provider", () => {
    expect(() => renderHook(() => useIntegrations())).toThrow(
      "useIntegrations must be used within an IntegrationsProvider"
    );
  });

  it("retorna factory injetada quando value parcial é fornecido", () => {
    const mockCalendarImporter = { importEvents: vi.fn() } as unknown as ICalendarImporter;
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <IntegrationsProvider value={{ createCalendarImporter: () => mockCalendarImporter }}>
        {children}
      </IntegrationsProvider>
    );
    const { result } = renderHook(() => useIntegrations(), { wrapper: customWrapper });

    expect(result.current.createCalendarImporter()).toBe(mockCalendarImporter);
    expect(result.current.createTicketImporter).toBeDefined();
    expect(result.current.createClockifyTaskSender).toBeDefined();
    expect(result.current.createSheetsTaskSender).toBeDefined();
    expect(result.current.createClockifyApi).toBeDefined();
  });

  it("factories padrão instanciam classes de infra", async () => {
    const { GoogleCalendarImporter } = await import(
      "@infra/integrations/GoogleCalendarImporter"
    );
    const { result } = renderHook(() => useIntegrations(), { wrapper });

    result.current.createCalendarImporter();

    expect(GoogleCalendarImporter).toHaveBeenCalled();
  });
});
