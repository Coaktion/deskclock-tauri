import type { ITicketImporter, ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { IZendeskAuthPort } from "@domain/integrations/IZendeskAuthPort";
import { ZendeskTokenManager } from "./zendesk/ZendeskTokenManager";
import { ZendeskClient } from "./zendesk/ZendeskClient";

export class ZendeskTicketImporter implements ITicketImporter {
  constructor(private config: IZendeskAuthPort) {}

  async getTickets(): Promise<ZendeskTicket[]> {
    const subdomain = this.config.get("zendeskSubdomain");
    const manager = new ZendeskTokenManager(this.config, subdomain);
    const accessToken = await manager.getValidAccessToken();
    const client = new ZendeskClient(subdomain, accessToken);
    return client.getAssignedOpenTickets();
  }
}
