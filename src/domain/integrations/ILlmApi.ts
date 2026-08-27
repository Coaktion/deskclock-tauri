export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ILlmApi {
  /** Uma completação de chat; devolve o texto da resposta. */
  complete(messages: LlmMessage[]): Promise<string>;
  /** Ids de modelo disponíveis. Usado para validar a chave e preencher o seletor. */
  listModels(): Promise<string[]>;
}
