import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SearchInput } from "@presentation/components/ui/SearchInput";

describe("SearchInput", () => {
  it("emite o texto digitado", () => {
    const onChange = vi.fn();
    render(<SearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "monday" } });
    expect(onChange).toHaveBeenCalledWith("monday");
  });

  it("nomeia o campo pelo placeholder quando não recebe rótulo", () => {
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Buscar por nome…" />);
    expect(screen.getByRole("searchbox", { name: "Buscar por nome…" })).toBeTruthy();
  });
});
