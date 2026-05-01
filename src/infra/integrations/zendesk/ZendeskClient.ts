import { invoke } from "@tauri-apps/api/core";
import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";

interface ZendeskTicketRaw {
  id: number;
  subject: string;
  status: "new" | "open" | "pending" | "hold" | "solved" | "closed";
}

interface RustHttpResponse {
  status: number;
  body: Record<string, unknown>;
}

export class ZendeskClient {
  constructor(
    private subdomain: string,
    private accessToken: string
  ) {}

  async getAssignedOpenTickets(): Promise<ZendeskTicket[]> {
    const query = encodeURIComponent("type:ticket assignee:me status<solved");
    const url = `https://${this.subdomain}.zendesk.com/api/v2/search.json?query=${query}&per_page=100`;

    const res = await invoke<RustHttpResponse>("get_bearer_json", {
      url,
      token: this.accessToken,
    });

    if (res.status === 401) throw new Error("Sessão expirada. Reconecte o Zendesk.");
    if (res.status >= 400) {
      throw new Error(
        (res.body["description"] as string) ?? `Erro ao buscar tickets (${res.status}).`
      );
    }

    const tickets = ((res.body["results"] as ZendeskTicketRaw[]) ?? []).filter((t) =>
      ["new", "open", "pending", "hold"].includes(t.status)
    );

    return tickets.map((t) => ({
      id: t.id,
      subject: t.subject,
      status: t.status as ZendeskTicket["status"],
      webUrl: `https://${this.subdomain}.zendesk.com/agent/tickets/${t.id}`,
    }));
  }
}
