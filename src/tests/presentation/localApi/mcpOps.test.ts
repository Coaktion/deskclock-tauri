import { describe, it, expect } from "vitest";
import { LOCAL_API_OPS } from "@presentation/localApi/dispatch";
import manifest from "../../../../src-tauri/mcp-ops.json";

// Trava de cobertura do MCP (docs-internal/specs/mcp.md §4): `op` nova na ponte
// reprova aqui até alguém decidir, com motivo escrito, se vira tool ou fica de fora.
const MANIFEST = "src-tauri/mcp-ops.json";
const exposed = Object.keys(manifest.exposed);
const excluded = Object.keys(manifest.excluded);

describe("manifesto de ops do MCP", () => {
  it("classifica toda op da ponte", () => {
    const classified = new Set([...exposed, ...excluded]);
    const missing = LOCAL_API_OPS.filter((op) => !classified.has(op));
    expect(
      missing,
      `ops sem classificação — inclua em "exposed" ou "excluded" de ${MANIFEST}: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("não tem op fora da ponte", () => {
    const known = new Set(LOCAL_API_OPS);
    const stale = [...exposed, ...excluded].filter((op) => !known.has(op));
    expect(
      stale,
      `ops que não existem mais em HANDLERS — remova de ${MANIFEST}: ${stale.join(", ")}`
    ).toEqual([]);
  });

  it("não põe a mesma op em exposed e excluded", () => {
    const both = exposed.filter((op) => excluded.includes(op));
    expect(both, `ops nas duas listas de ${MANIFEST}: ${both.join(", ")}`).toEqual([]);
  });
});
