import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SegmentedControl } from "@presentation/components/ui/SegmentedControl";

const MODES = [
  { value: "per-task", label: "Por tarefa" },
  { value: "daily", label: "Diário" },
] as const;

describe("SegmentedControl", () => {
  it("anuncia qual opção está escolhida, e só ela", () => {
    render(
      <SegmentedControl
        value="daily"
        options={MODES}
        ariaLabel="Modo de sincronização"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Diário" }).getAttribute("aria-pressed")).toBe(
      "true"
    );
    expect(screen.getByRole("button", { name: "Por tarefa" }).getAttribute("aria-pressed")).toBe(
      "false"
    );
  });

  it("o grupo diz de que é a escolha — os rótulos sozinhos não dizem", () => {
    render(
      <SegmentedControl
        value="daily"
        options={MODES}
        ariaLabel="Modo de sincronização"
        onChange={vi.fn()}
      />
    );
    expect(screen.getByRole("group", { name: "Modo de sincronização" })).toBeTruthy();
  });

  it("devolve o valor da opção clicada, não o rótulo", () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        value="daily"
        options={MODES}
        ariaLabel="Modo de sincronização"
        onChange={onChange}
      />
    );
    screen.getByRole("button", { name: "Por tarefa" }).click();
    expect(onChange).toHaveBeenCalledWith("per-task");
  });
});
