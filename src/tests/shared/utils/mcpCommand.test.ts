import { describe, it, expect } from "vitest";
import { buildMcpAddCommand } from "@shared/utils/mcpCommand";

describe("buildMcpAddCommand", () => {
  it("monta o comando do Claude Code com o transporte HTTP e a porta recebida", () => {
    expect(buildMcpAddCommand(27420)).toBe(
      "claude mcp add --transport http deskclock http://127.0.0.1:27420/mcp"
    );
    expect(buildMcpAddCommand(27421)).toBe(
      "claude mcp add --transport http deskclock http://127.0.0.1:27421/mcp"
    );
  });
});
