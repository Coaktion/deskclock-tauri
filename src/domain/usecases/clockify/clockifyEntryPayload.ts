import type { ClockifyTimeEntryPayload } from "@shared/types/clockify";
import { addDaysISO } from "@shared/utils/time";
import { projectDisplayName } from "@domain/usecases/clockify/clockifyEntries";

// O formulário de "Apontamentos do Clockify" (criar e editar), fora do modal
// para a API local gravar o mesmo apontamento (`docs-internal/specs/mcp.md` §7,
// Fase D2b): o que impede salvar e o payload que sobe.

/** O que o formulário junta: dia local e horas `HH:MM`, como os campos da tela. */
export interface ClockifyEntryDraft {
  description: string;
  /** Já resolvido do texto do campo de projeto; `null` = nenhum. */
  projectId: string | null;
  tagIds: string[];
  billable: boolean;
  dateISO: string;
  startHHMM: string;
  endHHMM: string;
}

export const CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED = "Informe a descrição do apontamento.";
export const CLOCKIFY_ENTRY_PROJECT_REQUIRED = "Escolha o projeto do apontamento.";

/**
 * Por que o rascunho não pode subir, ou `null`. A tela não mostra a frase — só
 * desabilita o botão (os campos têm `*`); a API a devolve.
 */
export function clockifyEntryDraftError(
  draft: Pick<ClockifyEntryDraft, "description" | "projectId">
): string | null {
  if (draft.description.trim() === "") return CLOCKIFY_ENTRY_DESCRIPTION_REQUIRED;
  if (draft.projectId === null) return CLOCKIFY_ENTRY_PROJECT_REQUIRED;
  return null;
}

/**
 * O projeto cujo nome exibido ("Cliente - Projeto", ver `projectDisplayName`) é
 * exatamente o texto — o casamento do campo de projeto da tela.
 */
export function clockifyProjectIdByName(
  projects: { id: string; name: string; clientName?: string | null }[],
  name: string
): string | null {
  return projects.find((p) => projectDisplayName(p) === name)?.id ?? null;
}

/** Instante do dia local `dateISO` às `hhmm` locais, em ISO (UTC). */
export function clockifyEntryInstant(dateISO: string, hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(`${dateISO}T00:00:00`);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

/**
 * O payload do Clockify. Fim antes do início é o dia seguinte (o apontamento que
 * vira a meia-noite). Projeto e tags vazios ficam fora do corpo.
 */
export function buildClockifyEntryPayload(draft: ClockifyEntryDraft): ClockifyTimeEntryPayload {
  const start = clockifyEntryInstant(draft.dateISO, draft.startHHMM);
  let end = clockifyEntryInstant(draft.dateISO, draft.endHHMM);
  if (new Date(end) < new Date(start)) {
    end = clockifyEntryInstant(addDaysISO(draft.dateISO, 1), draft.endHHMM);
  }
  return {
    start,
    end,
    description: draft.description.trim(),
    billable: draft.billable,
    ...(draft.projectId ? { projectId: draft.projectId } : {}),
    ...(draft.tagIds.length > 0 ? { tagIds: draft.tagIds } : {}),
  };
}
