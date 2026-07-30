import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppConfig } from "./ConfigContext";
import { useRepositories } from "./RepositoriesContext";
import { GoogleCalendarImporter } from "@infra/integrations/GoogleCalendarImporter";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { ClockifyTaskSender } from "@infra/integrations/ClockifyTaskSender";
import { ZendeskTicketImporter } from "@infra/integrations/ZendeskTicketImporter";
import { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import { MondayTaskSender } from "@infra/integrations/MondayTaskSender";
import { MondayClient } from "@infra/integrations/monday/MondayClient";
import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { ITicketImporter } from "@domain/integrations/ITicketImporter";
import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";

export interface IntegrationFactories {
  createCalendarImporter(): ICalendarImporter;
  createTicketImporter(): ITicketImporter;
  createSheetsTaskSender(args: {
    spreadsheetId: string;
    projects: Project[];
    categories: Category[];
  }): ITaskSender;
  createClockifyTaskSender(): ITaskSender;
  /** apiKey opcional → permite ConnectModal validar key não persistida. Default usa config. */
  createClockifyApi(apiKey?: string): IClockifyApi;
  createMondayTaskSender(): ITaskSender;
  /** apiKey opcional → permite ConnectModal validar key não persistida. Default usa config. */
  createMondayApi(apiKey?: string): IMondayApi;
}

const IntegrationsContext = createContext<IntegrationFactories | null>(null);

export function IntegrationsProvider({
  children,
  value,
}: {
  children: ReactNode;
  value?: Partial<IntegrationFactories>;
}) {
  const config = useAppConfig();
  const { mondayActivityItemRepo } = useRepositories();
  const defaults = useMemo<IntegrationFactories>(
    () => ({
      createCalendarImporter: () => new GoogleCalendarImporter(config),
      createTicketImporter: () => new ZendeskTicketImporter(config),
      createSheetsTaskSender: ({ spreadsheetId, projects, categories }) =>
        new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories),
      createClockifyTaskSender: () => new ClockifyTaskSender(config),
      createClockifyApi: (apiKey) => new ClockifyClient(apiKey ?? config.get("clockifyApiKey")),
      createMondayTaskSender: () => new MondayTaskSender(config, mondayActivityItemRepo),
      createMondayApi: (apiKey) => new MondayClient(apiKey ?? config.get("mondayApiKey")),
    }),
    [config, mondayActivityItemRepo]
  );
  const factories = useMemo(() => ({ ...defaults, ...value }), [defaults, value]);
  return <IntegrationsContext.Provider value={factories}>{children}</IntegrationsContext.Provider>;
}

export function useIntegrations(): IntegrationFactories {
  const ctx = useContext(IntegrationsContext);
  if (!ctx) throw new Error("useIntegrations must be used within an IntegrationsProvider");
  return ctx;
}
