import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAppConfig } from "./ConfigContext";
import { useRepositories } from "./RepositoriesContext";
import { GoogleCalendarImporter } from "@infra/integrations/GoogleCalendarImporter";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { ClockifyTaskSender } from "@infra/integrations/ClockifyTaskSender";
import { ZendeskTicketImporter } from "@infra/integrations/ZendeskTicketImporter";
import { ClockifyClient } from "@infra/integrations/clockify/ClockifyClient";
import {
  MondayTaskSender,
  type MondayTaskSenderOptions,
} from "@infra/integrations/MondayTaskSender";
import { MondayClient } from "@infra/integrations/monday/MondayClient";
import { OpenAiCompatClient } from "@infra/integrations/llm/OpenAiCompatClient";
import { findLlmProvider } from "@infra/integrations/llm/providers";
import { DriveBackupRunner } from "@infra/integrations/googledrive/DriveBackupRunner";
import type { ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { IDriveBackupRunner } from "@domain/integrations/IDriveBackupRunner";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { ITicketImporter } from "@domain/integrations/ITicketImporter";
import type { IClockifyApi } from "@domain/integrations/IClockifyApi";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { ILlmApi } from "@domain/integrations/ILlmApi";
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
  /** `forceWrite` no envio manual: escreve mesmo sem nada ter mudado. */
  createMondayTaskSender(options?: MondayTaskSenderOptions): ITaskSender;
  /** apiKey opcional → permite ConnectModal validar key não persistida. Default usa config. */
  createMondayApi(apiKey?: string): IMondayApi;
  createDriveBackupRunner(): IDriveBackupRunner;
  /**
   * Provedor de LLM. Os `overrides` existem pelo mesmo motivo do `apiKey` das
   * duas factories acima: o modal de conexão valida provedor, URL, chave e
   * modelo **antes** de persistir qualquer um deles.
   */
  createLlmApi(overrides?: LlmApiOverrides): ILlmApi;
}

export interface LlmApiOverrides {
  providerId?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
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
  const { mondayActivityItemRepo, customFieldRepo, categoryRepo } = useRepositories();
  const defaults = useMemo<IntegrationFactories>(
    () => ({
      createCalendarImporter: () => new GoogleCalendarImporter(config),
      createTicketImporter: () => new ZendeskTicketImporter(config),
      createSheetsTaskSender: ({ spreadsheetId, projects, categories }) =>
        new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories),
      createClockifyTaskSender: () => new ClockifyTaskSender(config),
      createClockifyApi: (apiKey) => new ClockifyClient(apiKey ?? config.get("clockifyApiKey")),
      createMondayTaskSender: (options) =>
        new MondayTaskSender(
          config,
          mondayActivityItemRepo,
          customFieldRepo,
          categoryRepo,
          undefined,
          options
        ),
      createMondayApi: (apiKey) => new MondayClient(apiKey ?? config.get("mondayApiKey")),
      createDriveBackupRunner: () => new DriveBackupRunner(config),
      createLlmApi: (overrides) => {
        // Os `extras` são compensação de comportamento do provedor, então saem
        // sempre do preset — nunca da config, que guarda só o que o usuário
        // escolhe.
        const preset = findLlmProvider(overrides?.providerId ?? config.get("llmProviderId"));
        return new OpenAiCompatClient({
          // `||` e não `??`: a config devolve string vazia quando nunca foi
          // gravada, e é o preset que responde por ela.
          baseUrl: overrides?.baseUrl || config.get("llmBaseUrl") || preset?.baseUrl || "",
          apiKey: overrides?.apiKey ?? config.get("llmApiKey"),
          model: overrides?.model ?? config.get("llmModel"),
          extras: preset?.extras,
        });
      },
    }),
    [config, mondayActivityItemRepo, customFieldRepo, categoryRepo]
  );
  const factories = useMemo(() => ({ ...defaults, ...value }), [defaults, value]);
  return <IntegrationsContext.Provider value={factories}>{children}</IntegrationsContext.Provider>;
}

export function useIntegrations(): IntegrationFactories {
  const ctx = useContext(IntegrationsContext);
  if (!ctx) throw new Error("useIntegrations must be used within an IntegrationsProvider");
  return ctx;
}
