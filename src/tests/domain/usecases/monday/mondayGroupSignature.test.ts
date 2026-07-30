import { describe, it, expect } from "vitest";
import { mondayGroupSignature } from "@domain/usecases/monday/mondayGroupSignature";

describe("mondayGroupSignature", () => {
  it("é estável para as mesmas entradas", () => {
    const a = mondayGroupSignature("123", "2026-07-30", "Reunião|proj-1|cat-1", true);
    const b = mondayGroupSignature("123", "2026-07-30", "Reunião|proj-1|cat-1", true);
    expect(a).toBe(b);
  });

  it("distingue boards diferentes", () => {
    expect(mondayGroupSignature("123", "2026-07-30", "k", true)).not.toBe(
      mondayGroupSignature("456", "2026-07-30", "k", true)
    );
  });

  it("distingue dias diferentes", () => {
    expect(mondayGroupSignature("123", "2026-07-30", "k", true)).not.toBe(
      mondayGroupSignature("123", "2026-07-31", "k", true)
    );
  });

  it("distingue grupos diferentes no mesmo dia e board", () => {
    expect(mondayGroupSignature("123", "2026-07-30", "A|p|c", true)).not.toBe(
      mondayGroupSignature("123", "2026-07-30", "B|p|c", true)
    );
  });

  it("separa billable de non-billable — a coluna Billing type do item é única", () => {
    expect(mondayGroupSignature("123", "2026-07-30", "k", true)).not.toBe(
      mondayGroupSignature("123", "2026-07-30", "k", false)
    );
  });
});
