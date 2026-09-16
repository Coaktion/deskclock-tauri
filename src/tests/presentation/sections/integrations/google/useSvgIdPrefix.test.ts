import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useSvgIdPrefix } from "@presentation/sections/integrations/google/useSvgIdPrefix";

describe("useSvgIdPrefix", () => {
  it("devolve só caracteres que sobrevivem a um url(#…)", () => {
    const { result } = renderHook(() => useSvgIdPrefix());
    expect(result.current).toMatch(/^g[A-Za-z0-9_-]+$/);
  });

  it("dá um prefixo diferente a cada instância", () => {
    const a = renderHook(() => useSvgIdPrefix());
    const b = renderHook(() => useSvgIdPrefix());
    expect(a.result.current).not.toBe(b.result.current);
  });
});
