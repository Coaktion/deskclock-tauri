import { describe, expect, it } from "vitest";
import {
  shouldHidePopupOnEscape,
  type PopupEscapeContext,
} from "@presentation/overlays/popupEscape";

const livre: PopupEscapeContext = {
  key: "Escape",
  defaultPrevented: false,
  meetingPromptActive: false,
  modalOpen: false,
  modalMarkerPresent: false,
};

describe("shouldHidePopupOnEscape", () => {
  it("ESC sem nada aberto esconde o popup", () => {
    expect(shouldHidePopupOnEscape(livre)).toBe(true);
  });

  it("outra tecla não esconde", () => {
    expect(shouldHidePopupOnEscape({ ...livre, key: "Enter" })).toBe(false);
  });

  it.each([
    ["tecla já consumida", { defaultPrevented: true }],
    ["prompt de reunião ativo", { meetingPromptActive: true }],
    ["painel de edição aberto", { modalOpen: true }],
    ["menu ou modal marcado no documento", { modalMarkerPresent: true }],
  ])("%s segura o popup", (_, extra) => {
    expect(shouldHidePopupOnEscape({ ...livre, ...extra })).toBe(false);
  });
});
