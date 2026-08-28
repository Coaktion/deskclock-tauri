import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckSquare, Loader2, Sparkles, Square } from "lucide-react";

import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { ExistingPlannedLine, WeekPlanDay } from "@domain/usecases/llm/buildWeekPlanPrompt";
import { Button, Modal, Textarea } from "@presentation/components/ui";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useWeekPlan } from "@presentation/hooks/useWeekPlan";
import { WeekPlanRow } from "@presentation/sections/planning/WeekPlanRow";

const EXAMPLE =
  "segunda e quarta, alinhamento do time às 9h; terça e quinta, relatório do cliente; sexta, revisar PRs";

interface PlanWeekModalProps {
  /** Os dias úteis da semana que está na tela — é o recorte que o plano ocupa. */
  weekDays: WeekPlanDay[];
  /** O rótulo da semana no cabeçalho, para o modal dizer sobre qual ele fala. */
  weekLabel: string;
  existing: ExistingPlannedLine[];
  onCreated: (created: PlannedTask[]) => void;
  onClose: () => void;
}

/**
 * O plano da semana em dois passos no mesmo diálogo: **pedido** e **revisão**.
 *
 * **Nada é criado sem a revisão**, e ela não é formalidade: o que está na lista
 * saiu de um modelo que pode ter entendido errado, e a linha criada vira dado no
 * banco do usuário. Não há caminho que pule a lista.
 *
 * **Enter não submete**, como nos outros três modais que operam sobre seleção
 * (§7 do CLAUDE.md). No `Textarea`, **Ctrl/Cmd+Enter** gera — que é o contrato
 * de campo de várias linhas.
 */
export function PlanWeekModal({
  weekDays,
  weekLabel,
  existing,
  onCreated,
  onClose,
}: PlanWeekModalProps) {
  const {
    request,
    setRequest,
    drafts,
    generating,
    creating,
    error,
    generate,
    updateDraft,
    backToRequest,
    create,
    projects,
    categories,
  } = useWeekPlan({ weekDays, existing });

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { categoriesFor } = useProjectCategoryMap();

  const ids = useMemo(() => (drafts ?? []).map((draft) => draft.id), [drafts]);
  const selection = useMultiSelect(ids);
  const { toggleAll } = selection;

  // A geração chega **toda marcada**: o usuário pediu este plano, e desmarcar a
  // proposta errada é menos trabalho que marcar as nove certas. Roda uma vez por
  // geração — os ids são novos a cada rodada, e nada está selecionado quando ela
  // chega, então o `toggleAll` só sabe marcar.
  useEffect(() => {
    if (ids.length > 0) toggleAll();
  }, [ids, toggleAll]);

  // Um mapa por tela, não um hook por linha (§6.4): a lista pode ter vinte
  // propostas, e um `useProjectCategoryMap` em cada seria vinte consultas para
  // montar um diálogo.
  const categoryOptionsFor = useCallback(
    (projectId: string | null) => categoriesFor(categories, projectId),
    [categories, categoriesFor]
  );

  async function handleCreate() {
    const chosen = (drafts ?? []).filter((draft) => selection.isSelected(draft.id));
    onCreated(await create(chosen));
  }

  const reviewing = drafts !== null;
  const empty = reviewing && drafts.length === 0;

  return (
    <Modal
      title={
        <>
          <Sparkles size={16} className="text-accent-text shrink-0" />
          Planejar a semana
        </>
      }
      description={weekLabel}
      size="lg"
      tall={reviewing && !empty}
      onClose={onClose}
      // Sem padding no corpo: em revisão cada linha desenha o próprio `px-4`.
      bodyClassName={reviewing && !empty ? "" : "p-5 flex flex-col gap-3"}
      footerStart={
        reviewing && !empty ? (
          <Button variant="ghost" onClick={selection.toggleAll}>
            {selection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {selection.allSelected ? "Desmarcar todas" : "Selecionar todas"}
            <span className="text-fg-muted">({drafts.length})</span>
          </Button>
        ) : undefined
      }
      footer={
        reviewing ? (
          <>
            <Button variant="ghost" onClick={backToRequest}>
              Voltar ao pedido
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={selection.count === 0}
              loading={creating}
            >
              {creating ? "Criando…" : `Criar ${selection.count} tarefa(s)`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={() => void generate()}
              disabled={request.trim() === ""}
              loading={generating}
            >
              {generating ? "Gerando…" : "Gerar plano"}
            </Button>
          </>
        )
      }
    >
      {!reviewing && (
        <>
          <Textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+Enter gera; Enter sozinho quebra linha, que é o
              // contrato de campo de várias linhas.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                void generate();
              }
            }}
            rows={5}
            autoFocus
            placeholder={EXAMPLE}
            aria-label="O que você vai fazer nesta semana"
          />
          <p className="text-xs text-fg-muted">
            Descreva a semana como você contaria a alguém. As tarefas propostas aparecem para
            revisão antes de serem criadas.
          </p>
        </>
      )}

      {error && (
        <div className="flex items-start gap-2 m-4 p-3 bg-danger/10 border border-danger rounded-control">
          <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{error}</p>
        </div>
      )}

      {generating && reviewing && (
        <div className="flex items-center justify-center gap-2 py-12 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Montando o plano…</span>
        </div>
      )}

      {empty && !error && (
        <p className="text-sm text-fg-muted text-center py-12">
          O modelo não devolveu um plano legível. Tente descrever a semana com mais detalhe.
        </p>
      )}

      {reviewing &&
        drafts.map((draft) => (
          <WeekPlanRow
            key={draft.id}
            draft={draft}
            selected={selection.isSelected(draft.id)}
            expanded={expandedId === draft.id}
            weekDays={weekDays}
            projects={projects}
            categories={categories}
            categoryOptionsFor={categoryOptionsFor}
            onToggleSelect={() => selection.toggle(draft.id)}
            onToggleExpand={() => setExpandedId((prev) => (prev === draft.id ? null : draft.id))}
            onChange={(next) => updateDraft(draft.id, next)}
          />
        ))}
    </Modal>
  );
}
