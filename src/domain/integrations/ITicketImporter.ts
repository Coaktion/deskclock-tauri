export interface ZendeskTicket {
  id: number;
  subject: string;
  status: "new" | "open" | "pending" | "hold";
  webUrl: string;
}

export interface ITicketImporter {
  getTickets(): Promise<ZendeskTicket[]>;
}
