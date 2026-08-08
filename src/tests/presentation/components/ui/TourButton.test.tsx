import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TourButton } from "@presentation/components/ui/TourButton";

describe("TourButton", () => {
  it("o rótulo padrão é o da página — é o caso da maioria dos call sites", () => {
    render(<TourButton onClick={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Ver tour da página" })).toBeTruthy();
  });

  it("o rótulo diz o que o tour cobre, e vale como tooltip também", () => {
    render(<TourButton onClick={vi.fn()} label="Ver tour da integração" />);
    const button = screen.getByRole("button", { name: "Ver tour da integração" });
    expect(button.getAttribute("title")).toBe("Ver tour da integração");
  });

  it("dispara o tour", () => {
    const onClick = vi.fn();
    render(<TourButton onClick={onClick} />);
    screen.getByRole("button").click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
