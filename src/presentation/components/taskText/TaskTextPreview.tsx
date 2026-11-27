import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  TaskFieldHint,
  TaskTextCatalog,
  TaskTextInterpretation,
} from "@domain/usecases/llm/taskText/types";
import type { TaskTextStatus } from "@presentation/hooks/useTaskTextInterpretation";
import { Menu, type MenuAnchor, type MenuItem } from "@presentation/components/ui";
import {
  chipAttentionClass,
  chipBillableClass,
  chipNonBillableClass,
  chipStaticEmptyClass,
  chipStaticFilledClass,
} from "../chipStyles";
import { buildPreviewChips, type PreviewChip } from "./previewChips";

interface TaskTextPreviewProps {
  status: TaskTextStatus;
  interpretation: TaskTextInterpretation | null;
  /** Já traduzido para a tela. */
  error: string | null;
  hints: TaskFieldHint[];
  catalog: TaskTextCatalog;
  onChoose: (key: string, candidateId: string) => void;
  onToggleBillable: () => void;
  /** O rodapé com as teclas; cada superfície diz as suas. */
  keysHint?: string;
  /** O que o Enter faz depois de um erro — idem. */
  errorHint?: string;
}

interface OpenChoice {
  chip: Extract<PreviewChip, { kind: "ambiguous" }>;
  anchor: MenuAnchor;
}

function choiceItems(
  open: OpenChoice | null,
  onChoose: TaskTextPreviewProps["onChoose"]
): MenuItem[] {
  if (!open) return [];
  const { key, candidates } = open.chip;
  return candidates.map((c) => ({ label: c.label, onSelect: () => onChoose(key, c.id) }));
}

/**
 * A tarefa como o texto foi entendido, um chip por campo, para o usuário
 * conferir antes de iniciar. Campo ambíguo é o chip destacado que abre os
 * candidatos; não encontrado é o chip vazio com o que foi digitado riscado.
 */
export function TaskTextPreview({
  status,
  interpretation,
  error,
  hints,
  catalog,
  onChoose,
  onToggleBillable,
  keysHint = "Enter inicia · Esc fecha",
  errorHint = "Enter inicia com o texto como nome.",
}: TaskTextPreviewProps) {
  const [open, setOpen] = useState<OpenChoice | null>(null);
  const chips = useMemo(
    () => (interpretation ? buildPreviewChips(interpretation, hints, catalog) : []),
    [interpretation, hints, catalog]
  );

  if (status === "analyzing") {
    return <p className="text-sm text-fg-muted">Analisando…</p>;
  }
  if (status === "error") {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm text-danger">{error}</p>
        <p className="text-xs text-fg-muted">{errorHint}</p>
      </div>
    );
  }
  if (status !== "preview" || !interpretation) return null;

  function renderChip(chip: PreviewChip) {
    switch (chip.kind) {
      case "value":
        return (
          <span key={chip.key} className={chipStaticFilledClass} title={chip.title}>
            {chip.label}
          </span>
        );
      case "empty":
        return (
          <span key={chip.key} className={chipStaticEmptyClass}>
            {chip.label}
          </span>
        );
      case "notFound":
        return (
          <span key={chip.key} className={chipStaticEmptyClass} title={chip.title}>
            {chip.label}: <span className="line-through">{chip.query}</span>
          </span>
        );
      case "billable":
        return (
          <button
            key={chip.key}
            type="button"
            onClick={onToggleBillable}
            className={chip.billable ? chipBillableClass : chipNonBillableClass}
          >
            {chip.billable ? "Billable" : "Non-billable"}
          </button>
        );
      case "ambiguous":
        return (
          <button
            key={chip.key}
            type="button"
            title={chip.title}
            aria-haspopup="menu"
            onClick={(e) => {
              const anchor = e.currentTarget;
              setOpen((current) => (current?.chip.key === chip.key ? null : { chip, anchor }));
            }}
            className={chipAttentionClass}
          >
            {chip.label}
            <ChevronDown size={12} />
          </button>
        );
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 flex-wrap">{chips.map(renderChip)}</div>
      <p className="text-xs text-fg-muted">{keysHint}</p>
      <Menu
        anchor={open?.anchor ?? null}
        label={open ? `Escolher ${open.chip.fieldLabel}` : undefined}
        items={choiceItems(open, onChoose)}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
