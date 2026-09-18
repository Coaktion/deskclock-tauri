/**
 * O comando que conecta o Claude Code ao servidor MCP do app. O host é
 * `127.0.0.1`, não `localhost`: a API só escuta em IPv4 loopback, e há
 * sistema em que `localhost` resolve primeiro para `::1`.
 */
export function buildMcpAddCommand(port: number): string {
  return `claude mcp add --transport http deskclock http://127.0.0.1:${port}/mcp`;
}
