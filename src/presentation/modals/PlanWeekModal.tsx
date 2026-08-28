import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckSquare, Loader2, Sparkles, Square } from "lucide-react";

import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { PlanGapFill } from "@domain/usecases/llm/FillPlanGaps";
import type { ExistingPlannedLine, WeekPlanDay } from "@domain/usecases/llm/buildWeekPlanPrompt";
import { Button, Modal, SegmentedControl, Textarea } from "@presentation/components/ui";
import { useMultiSelect } from "@presentation/hooks/useMultiSelect";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { usePlanGaps } from "@presentation/hooks/usePlanGaps";
import { useWeekPlan } from "@presentation/hooks/useWeekPlan";
import { PlanGapRow } from "@presentation/sections/planning/PlanGapRow";
import { WeekPlanRow } from "@presentation/sections/planning/WeekPlanRow";

const EXAMPLE =
  "segunda e quarta, alinhamento do time às 9h; terça e quinta, relatório do cliente; sexta, revisar PRs";

type PlanTab = "plan" | "gaps";

interface PlanWeekModalProps {
  /** Os dias úteis da semana que está na tela — é o recorte que o plano ocupa. */
  weekDays: WeekPlanDay[];
  /** O rótulo da semana no cabeçalho, para o modal dizer sobre qual ele fala. */
  weekLabel: string;
  existing: ExistingPlannedLine[];
  /** As planejadas da semana — a aba "Revisar" trabalha sobre elas. */
  weekTasks: PlannedTask[];
  onCreated: (created: PlannedTask[]) => void;
  /** Chamado quando a revisão gravou preenchimentos nas planejadas existentes. */
  onFilled: (updated: PlannedTask[]) => void;
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
  weekTasks,
  onCreated,
  onFilled,
  onClose,
}: PlanWeekModalProps) {
  const [tab, setTab] = useState<PlanTab>("plan");
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

  const gapsState = usePlanGaps(weekTasks);
  const gapIds = useMemo(
    () => (gapsState.fills ?? []).map((fill) => fill.taskId),
    [gapsState.fills]
  );
  const gapSelection = useMultiSelect(gapIds);
  const { toggleAll: toggleAllGaps } = gapSelection;

  // Mesma regra da outra aba: o que a IA propôs chega marcado, e recusar é
  // desmarcar.
  useEffect(() => {
    if (gapIds.length > 0) toggleAllGaps();
  }, [gapIds, toggleAllGaps]);

  const fillByTaskId = useMemo(
    () => new Map((gapsState.fills ?? []).map((fill: PlanGapFill) => [fill.taskId, fill])),
    [gapsState.fills]
  );

  async function handleCreate() {
    const chosen = (drafts ?? []).filter((draft) => selection.isSelected(draft.id));
    onCreated(await create(chosen));
  }

  async function handleApplyFills() {
    const chosen = (gapsState.fills ?? []).filter((fill) => gapSelection.isSelected(fill.taskId));
    gapsState.setApplying(true);
    try {
      onFilled(await gapsState.apply(chosen));
    } finally {
      gapsState.setApplying(false);
    }
  }

  const reviewing = drafts !== null;
  const empty = reviewing && drafts.length === 0;
  const onGaps = tab === "gaps";
  // O corpo é lista de borda a borda nas duas abas quando há linhas; fora
  // disso é bloco com padding.
  const listMode = onGaps ? gapsState.gaps.length > 0 : reviewing && !empty;

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
      tall={onGaps ? gapsState.gaps.length > 0 : reviewing && !empty}
      onClose={onClose}
      // Sem padding no corpo: nas duas listas cada linha desenha o próprio
      // `px-4`.
      bodyClassName={listMode ? "" : "p-5 flex flex-col gap-3"}
      // As abas ficam na `toolbar`, e não no corpo: ali elas não rolam junto
      // com a lista que trocam.
      toolbar={
        <SegmentedControl
          ariaLabel="O que fazer com a semana"
          value={tab}
          onChange={setTab}
          options={[
            { value: "plan" as const, label: "Planejar" },
            {
              value: "gaps" as const,
              label: gapsState.gaps.length > 0 ? `Revisar · ${gapsState.gaps.length}` : "Revisar",
            },
          ]}
        />
      }
      footerStart={
        onGaps ? (
          gapIds.length > 0 ? (
            <Button variant="ghost" onClick={gapSelection.toggleAll}>
              {gapSelection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {gapSelection.allSelected ? "Desmarcar todas" : "Selecionar todas"}
              <span className="text-fg-muted">({gapIds.length})</span>
            </Button>
          ) : undefined
        ) : reviewing && !empty ? (
          <Button variant="ghost" onClick={selection.toggleAll}>
            {selection.allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {selection.allSelected ? "Desmarcar todas" : "Selecionar todas"}
            <span className="text-fg-muted">({drafts.length})</span>
          </Button>
        ) : undefined
      }
      footer={
        onGaps ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Fechar
            </Button>
            {gapsState.fills === null ? (
              <Button
                variant="primary"
                onClick={() => void gapsState.generate()}
                disabled={gapsState.gaps.length === 0}
                loading={gapsState.generating}
              >
                {gapsState.generating ? "Analisando…" : "Preencher com IA"}
              </Button>
            ) : (
              <Button
                variant="primary"
                onClick={() => void handleApplyFills()}
                disabled={gapSelection.count === 0}
                loading={gapsState.applying}
              >
                {gapsState.applying ? "Aplicando…" : `Aplicar em ${gapSelection.count} tarefa(s)`}
              </Button>
            )}
          </>
        ) : reviewing ? (
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
      {!onGaps && !reviewing && (
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

      {(onGaps ? gapsState.error : error) && (
        <div className="flex items-start gap-2 m-4 p-3 bg-danger/10 border border-danger rounded-control">
          <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
          <p className="text-xs text-danger">{onGaps ? gapsState.error : error}</p>
        </div>
      )}

      {!onGaps && generating && reviewing && (
        <div className="flex items-center justify-center gap-2 py-12 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Montando o plano…</span>
        </div>
      )}

      {!onGaps && empty && !error && (
        <p className="text-sm text-fg-muted text-center py-12">
          O modelo não devolveu um plano legível. Tente descrever a semana com mais detalhe.
        </p>
      )}

      {!onGaps &&
        reviewing &&
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

      {onGaps && gapsState.gaps.length === 0 && (
        <p className="text-sm text-fg-muted text-center py-12">
          Nenhuma planejada desta semana tem projeto, categoria ou campo de escolha em branco.
        </p>
      )}

      {onGaps && gapsState.generating && (
        <div className="flex items-center justify-center gap-2 py-12 text-fg-muted">
          <Loader2 size={16} className="animate-spin" />
          <span className="text-sm">Analisando as lacunas…</span>
        </div>
      )}

      {onGaps &&
        !gapsState.generating &&
        gapsState.gaps.map((gap) => (
          <PlanGapRow
            key={gap.task.id}
            gap={gap}
            fill={fillByTaskId.get(gap.task.id)}
            selected={gapSelection.isSelected(gap.task.id)}
            projects={gapsState.projects}
            categories={gapsState.categories}
            selectFields={gapsState.selectFields}
            onToggleSelect={() => gapSelection.toggle(gap.task.id)}
          />
        ))}
    </Modal>
  );
}
