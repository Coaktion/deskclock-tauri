import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlannedPlaySlot } from "@presentation/components/PlannedPlaySlot";
import { PLAY_BLOCKED_TITLE, PLAY_SELF_TITLE } from "@presentation/components/playAction";

afterEach(cleanup);

const slot = () => document.querySelector("[data-play-slot]") as HTMLElement;

describe("PlannedPlaySlot", () => {
  it("livre, inicia sem o clique chegar à linha", () => {
    const onPlay = vi.fn();
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <PlannedPlaySlot playBlock="none" onPlay={onPlay} />
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "Iniciar" }));
    expect(onPlay).toHaveBeenCalledTimes(1);
    expect(onRow).not.toHaveBeenCalled();
  });

  it("bloqueado, fica visível e desabilitado, com o motivo no title", () => {
    render(<PlannedPlaySlot playBlock="other" onPlay={vi.fn()} />);
    const play = screen.getByRole("button", { name: PLAY_BLOCKED_TITLE }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    cleanup();
    render(<PlannedPlaySlot playBlock="self" onPlay={vi.fn()} />);
    expect(screen.getByRole("button", { name: PLAY_SELF_TITLE })).toBeTruthy();
  });

  it("vazio, a coluna fica com a largura e sem botão", () => {
    render(<PlannedPlaySlot playBlock="none" onPlay={vi.fn()} empty />);
    expect(slot().className).toContain("w-7");
    expect(slot().children.length).toBe(0);
  });
});
