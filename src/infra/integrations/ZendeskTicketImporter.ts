import type { ITicketImporter, ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import { ZendeskTokenManager } from "./zendesk/ZendeskTokenManager";
import { ZendeskClient } from "./zendesk/ZendeskClient";

export class ZendeskTicketImporter implements ITicketImporter {
  constructor(private config: ConfigContextValue) {}

  async getTickets(): Promise<ZendeskTicket[]> {
    const subdomain = this.config.get("zendeskSubdomain");
    const manager = new ZendeskTokenManager(this.config, subdomain);
    const accessToken = await manager.getValidAccessToken();
    const client = new ZendeskClient(subdomain, accessToken);
    return client.getAssignedOpenTickets();
  }
}
