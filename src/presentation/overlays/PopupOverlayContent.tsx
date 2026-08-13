import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask, PlannedTaskAction } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { groupPlannedBySchedule } from "@domain/utils/plannedSchedule";
import { ActionChip } from "@presentation/components/ActionChip";
import { Button, IconButton, Input, TaskRow } from "@presentation/components/ui";
import { SectionHeading } from "@presentation/components/ui/SectionHeading";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCompletedTasksForDate } from "@presentation/hooks/useCompletedTasksForDate";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { usePlannedTasksForDate } from "@presentation/hooks/usePlannedTasks";
import { useProjects } from "@presentation/hooks/useProjects";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { useTaskTimer } from "@presentation/hooks/useTaskTimer";
import { useTrackedMeetingPlannedIds } from "@presentation/hooks/useTrackedMeetingPlannedIds";
import { CompletedTaskEditSheet } from "@presentation/overlays/CompletedTaskEditSheet";
import { CompletedTasksSection } from "@presentation/overlays/CompletedTasksSection";
import { OverlayWorkspaceChip } from "@presentation/overlays/OverlayWorkspaceChip";
import { PlannedTaskEditSheet } from "@presentation/overlays/PlannedTaskEditSheet";
import { RunningTaskEditSheet } from "@presentation/overlays/RunningTaskEditSheet";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { getProjectColor } from "@shared/utils/projectColor";
import { formatHHMMSS, parseStartTimeInput, todayISO } from "@shared/utils/time";
import { POPUP_SIZE } from "@shared/utils/windowPosition";
import { emit } from "@tauri-apps/api/event";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock,
  Pen,
  Play,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

/*
 * **O popup tem uma altura só, e ela não depende do estado.** Idle e running
 * medem o mesmo `POPUP_SIZE.height`, então iniciar ou parar uma tarefa não mexe
 * na janela — que é o que tirava o overlay do canto onde o usuário o deixou, e o
 * que fazia a lista saltar sob o cursor. Os 380px são escolha do usuário
 * (2026-08-12).
 *
 * **A lista continua visível durante a execução**, e é isso que decide o
 * arranjo: a tarefa em execução é o rodapé, não uma tela que substitui a lista.
 * De cima para baixo: header, barra de abas (sempre visível), conteúdo da aba —
 * o único `flex-1`, e por isso o único que cede espaço quando o rodapé aparece
 * ou cresce (a confirmação de parada) — e o rodapé. Enquanto a altura era somada
 * por estado, ela mentia em três lugares ao mesmo tempo, e a soma máxima passava
 * do teto do `setMaxSize`, que cortava o excedente calado.
 *
 * **O rodapé é um espaço só, disputado por dois estados**: parado, ele é o
 * "Nova tarefa"; em execução, é o card do cronômetro. Nunca os dois — e é essa
 * exclusão que ainda impede a segunda tarefa simultânea, já que
 * `handleStartTask` não tem a guarda que o `handlePlay` tem.
 *
 * **A cor separa cromo de conteúdo**: o corpo (abas e lista) fica no `canvas`, e
 * header e rodapé em execução no `surface`, um degrau acima. O contorno da
 * janela é do `canvas`, então quem encosta na borda arredondada precisa levar o
 * arredondamento junto.
 *
 * O que varia com o cadastro do usuário — nome, projeto, categoria, hora, campos
 * personalizados e ações — mora no `RunningTaskEditSheet`, painel que cobre o
 * popup no tamanho que ele já tem. Enquanto esses campos ficavam no corpo, o
 * tamanho do popup dependia de quantos campos alguém tinha cadastrado.
 *
 * As alturas abaixo são px de um conteúdo que é todo em rem: qualquer mudança na
 * raiz do documento as desatualiza por inteiro.
 */
const POPUP_W = POPUP_SIZE.width;
const HEADER_H = 42;
const FOOTER_H = 39;
const TABS_H = 37;

interface PopupOverlayContentProps {
  runningTask: Task | null;
  activePlannedTaskActions: PlannedTaskAction[];
  onNavigatePlanning: () => void;
  onResize: (width: number, height: number) => void;
  /**
   * Avisa a janela que há um modal aberto. Enquanto houver, o popup não pode
   * sumir no blur nem no ESC — fechar sozinho descartaria a edição em curso.
   */
  onModalOpenChange: (open: boolean) => void;
  onStartTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable: boolean;
    plannedTaskId?: string | null;
  }) => Promise<void>;
  onPlay: (task: PlannedTask) => Promise<void>;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean, endTimeISO?: string) => Promise<void>;
  onCancel: () => Promise<void>;
  onUpdateTask: (input: {
    name?: string | null;
    projectId?: string | null;
    categoryId?: string | null;
    billable?: boolean;
    startTime?: string;
    customValues?: CustomValues;
  }) => Promise<void>;
}

// ─── Running card ────────────────────────────────────────────────────────────

interface RunningCardProps {
  task: Task;
  /** Ações da planejada de origem — disparadas daqui, nunca editadas. */
  actions: PlannedTaskAction[];
  confirmingStop: boolean;
  setConfirmingStop: (v: boolean) => void;
  /** Abre o painel com nome, projeto, categoria, billable, hora, campos e ações. */
  onEdit: () => void;
  onPause: () => Promise<void>;
  onResume: () => Promise<void>;
  onStop: (completed: boolean, endTimeISO?: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

/**
 * A tarefa em execução em duas linhas, no rodapé do popup: ponto de estado,
 * nome e editar em cima; cronômetro e controles embaixo.
 *
 * **O estado é o ponto e a cor do cronômetro**, sem o rótulo "Rodando"/"Pausada"
 * que ficava acima do nome — acento pulsando enquanto roda, âmbar parado quando
 * pausada. O que a linha economiza em altura é o que a lista de planejadas ganha
 * logo acima.
 *
 * O `✎` fica na linha da identidade, no lugar onde ficava o chip de billable:
 * ele abre o painel que edita o nome ao lado do qual está, e a linha de baixo
 * fica só com o que opera o relógio. **O billable saiu do card** — alterná-lo
 * agora é dentro do painel, junto da categoria de que ele é atributo.
 *
 * **As ações voltaram ao card, e como faixa que flutua.** Elas tinham seção
 * própria antes de a execução virar rodapé, e ficaram só dentro do
 * `RunningTaskEditSheet` — três interações para o clique que a reunião pede no
 * segundo em que começa. Aqui a faixa não ocupa altura nenhuma em repouso e não
 * empurra a lista ao abrir: ela cobre a última linha, e nada no fluxo se mexe.
 */
function RunningCard({
  task,
  actions,
  confirmingStop,
  setConfirmingStop,
  onEdit,
  onPause,
  onResume,
  onStop,
  onCancel,
}: RunningCardProps) {
  const seconds = useTaskTimer(task);
  const isRunning = task.status === "running";
  const [endTimeInput, setEndTimeInput] = useState("");
  const [endTimeTouched, setEndTimeTouched] = useState(false);

  function openConfirmStop() {
    const now = new Date();
    setEndTimeInput(
      `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    );
    setEndTimeTouched(false);
    setConfirmingStop(true);
  }

  function resolveEndTimeISO(): { iso: string | undefined; error: string | null } {
    if (!endTimeTouched) return { iso: undefined, error: null };
    const parsed = parseStartTimeInput(endTimeInput, task.startTime);
    if (!parsed) return { iso: undefined, error: "Hora inválida" };
    if (new Date(parsed).getTime() < new Date(task.startTime).getTime())
      return { iso: undefined, error: "Após o início" };
    return { iso: parsed, error: null };
  }

  const endTimeResolved = resolveEndTimeISO();

  const handleConfirmStopKeyDown = useSubmitOnEnter(
    () => {
      setConfirmingStop(false);
      void onStop(true, endTimeResolved.iso);
    },
    { disabled: !!endTimeResolved.error }
  );

  return (
    <div className="group relative shrink-0 flex flex-col gap-2 px-3 py-2.5 bg-surface border-t border-border rounded-b-card">
      {/* A faixa das ações **cresce para cima e não empurra ninguém**. As duas
          propriedades são o que a tornam viável num card que se hover para
          clicar: fora do fluxo, a lista não reflui a cada vez que o cursor
          cruza o rodapé; acima do nome, o que se move é a aresta de cima — o
          cronômetro e os botões ficam parados no mesmo y. Abrindo abaixo do
          nome, a faixa empurraria o Parar para debaixo do cursor no exato
          gesto de ir clicar nele.

          Ela é filha do card, e é isso que sustenta o `group-hover`: `:hover`
          sobe pela **árvore**, não pela geometria, então o cursor sobre a
          faixa — que está fora da caixa do card — mantém o card em hover. Como
          irmã, ela morreria ao subir o cursor.

          `group-focus-within` é o mesmo bloco para quem navega pelo teclado, o
          par que a linha do Planejamento já usa (§5.3).

          Fora durante a confirmação de parada: ali o card já cresceu, e quem
          está escolhendo Concluída/Pendente não vai abrir o link. */}
      {actions.length > 0 && !confirmingStop && (
        <div className="hidden group-hover:flex group-focus-within:flex absolute bottom-full left-0 right-0 z-10 flex-wrap gap-1.5 px-3 py-2 bg-surface border-t border-border shadow-lg">
          {actions.map((action, i) => (
            <ActionChip key={i} action={action} />
          ))}
        </div>
      )}

      {/* Identidade */}
      {/* **O `✎` cola no fim do nome, e é por isso que o nome não é `flex-1`.**
          Clicar no nome já abre a edição — o botão é indicação visual de que
          aquilo se edita, e indicação que flutua a 100px do texto não indica
          nada. Sem o `flex-1`, o botão do nome encolhe ao conteúdo e o `✎` vem
          logo atrás; o `min-w-0` é o que permite ao `truncate` agir quando o
          nome é longo (medido: ele para em 190px e a linha fecha exata). Quem
          ocupa a folga passa a ser o `ml-auto` do cancelar. */}
      <div className="flex items-center gap-1.5">
        <span
          title={isRunning ? "Rodando" : "Pausada"}
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "animate-pulse bg-accent" : "bg-paused"}`}
        />
        <button
          onClick={onEdit}
          title="Editar tarefa"
          className="min-w-0 text-left text-sm font-medium text-fg truncate"
        >
          {task.name ?? <span className="text-fg-muted italic">(sem nome)</span>}
        </button>
        <IconButton icon={<Pen size={14} />} title="Editar tarefa" onClick={onEdit} />
        {/* Cancelar mora na ponta oposta ao que opera o relógio, e nesta linha
            porque descartar a tarefa é ação sobre a **tarefa**, não sobre o
            tempo. Encostado no Parar — que era onde ele morava — o descarte
            ficava a um pixel da ação que salva, e o usuário passava a mirar.
            `px-1!` estreita a caixa ao glifo: sem o `!`, o `px-2.5` do próprio
            `size` vence, porque as duas classes têm a mesma especificidade e
            quem decide passa a ser a ordem em que o Tailwind as emite, não a
            ordem em que estão escritas aqui. */}
        <Button
          variant="secondary"
          size="sm"
          className="px-1! shrink-0 ml-auto"
          title="Cancelar"
          onClick={() => void onCancel()}
        >
          <X size={14} className="text-danger" />
        </Button>
      </div>

      {confirmingStop ? (
        // Enter no campo de hora encerra como **Concluída** — a ação primária do
        // painel, e a única que cabe num atalho: "Pendente" é a escolha
        // alternativa, e continua exigindo o clique que a diferencia.
        <div className="flex flex-col gap-1.5" onKeyDown={handleConfirmStopKeyDown}>
          <div className="flex items-center gap-1.5">
            <span className="text-sm text-fg-secondary shrink-0">Encerrar às</span>
            <Clock size={14} className="text-fg-muted shrink-0" />
            <Input
              type="time"
              variant="plain"
              size="sm"
              aria-label="Hora de término"
              value={endTimeInput}
              onChange={(e) => {
                setEndTimeInput(e.target.value);
                setEndTimeTouched(true);
              }}
              className={`flex-1 min-w-0 border-b ${
                endTimeResolved.error
                  ? "border-danger focus:border-danger"
                  : "border-border focus:border-accent"
              }`}
            />
            <IconButton
              icon={<Play size={14} />}
              title="Retomar"
              onClick={() => setConfirmingStop(false)}
            />
          </div>
          {endTimeResolved.error && (
            <span className="text-xs text-danger">{endTimeResolved.error}</span>
          )}
          <div className="flex items-center gap-1.5">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircle2 size={14} />}
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(true, endTimeResolved.iso);
              }}
            >
              Concluída
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Clock size={14} />}
              disabled={!!endTimeResolved.error}
              onClick={() => {
                setConfirmingStop(false);
                void onStop(false, endTimeResolved.iso);
              }}
            >
              Pendente
            </Button>
          </div>
        </div>
      ) : (
        // A linha do relógio fica só com o que opera o tempo, e os dois botões
        // dizem o que fazem **por escrito** — sem glifo. Não é preferência: o
        // card tem 264px úteis (popup de 288 menos o `px-3`) e o cronômetro em
        // `display/timer` come 112 deles, então rótulo **e** ícone nos dois
        // mede 270px rodando e 279px pausado. "Retomar" é 9px mais largo que
        // "Pausar", e por isso é sempre o estado pausado que decide se um
        // arranjo cabe. Escrito e sem ícone, o pior caso fecha em 239px — e em
        // 253px com cronômetro de três dígitos de hora, que é o timer esquecido
        // rodando o fim de semana.
        <div className="flex items-center gap-1.5">
          <p
            className={`shrink-0 font-mono text-2xl font-medium tabular-nums leading-none ${isRunning ? "text-accent-text" : "text-paused"}`}
          >
            {formatHHMMSS(seconds)}
          </p>
          {/* O rótulo herda a cor do **destino** da ação — âmbar para o estado a
              que ele leva a tarefa, acento para a volta —, que é o que o glifo
              carregava antes de sair. Vai num `<span>` e não na `className` do
              botão porque o `text-fg-secondary` da variante `secondary` tem a
              mesma especificidade: no elemento, quem venceria seria a ordem de
              emissão do Tailwind; num filho, não há disputa. */}
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 ml-auto"
            title={isRunning ? "Pausar" : "Retomar"}
            onClick={() => void (isRunning ? onPause() : onResume())}
          >
            <span className={isRunning ? "text-paused" : "text-accent-text"}>
              {isRunning ? "Pausar" : "Retomar"}
            </span>
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="shrink-0"
            title="Parar"
            onClick={openConfirmStop}
          >
            Parar
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Planned list ────────────────────────────────────────────────────────────

interface PlannedRowProps {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  /** O rastreamento automático vai lembrar de iniciar esta reunião. */
  tracked: boolean;
  onEdit: (task: PlannedTask) => void;
  onComplete: (task: PlannedTask) => void;
  onPlay: (task: PlannedTask) => void;
}

/**
 * A linha da planejada no popup, no mesmo primitivo das demais telas.
 *
 * O horário ocupa o slot da **duração**, que é a célula que recua no hover para
 * as ações entrarem no lugar dela: em repouso a linha mostra o que ela é, e os
 * botões só aparecem quando o cursor chega. Sem horário não há o que recuar, e
 * aí quem fecha é a **largura** (`collapseActions`) — é o que dá o mesmo
 * comportamento às duas seções em vez de deixar metade da lista com três botões
 * permanentes comendo o `1fr` do nome.
 */
function PlannedRow({
  task,
  projects,
  categories,
  tracked,
  onEdit,
  onComplete,
  onPlay,
}: PlannedRowProps) {
  const project = projects.find((p) => p.id === task.projectId);
  const category = categories.find((c) => c.id === task.categoryId);
  const subtitle = [project?.name, category?.name].filter(Boolean).join(" · ");
  // A mesma leitura de `groupPlannedBySchedule`, ou a linha em branco cairia na
  // seção "sem hora" e ainda assim desenharia a célula do horário.
  const startTime = task.startTime?.trim() || undefined;

  return (
    <TaskRow
      title={task.name}
      titleMarks={
        tracked ? (
          <span
            className="shrink-0 flex items-center text-accent-text/80"
            title="Rastreada — o app vai lembrar de iniciar esta reunião"
          >
            <Bell size={14} />
          </span>
        ) : undefined
      }
      subtitle={subtitle || undefined}
      dotColor={getProjectColor(project)}
      duration={startTime}
      collapseActions={!startTime}
      actions={
        <>
          <IconButton
            icon={<Pen size={14} />}
            title="Editar"
            size="sm"
            variant="neutral"
            onClick={() => onEdit(task)}
          />
          <IconButton
            icon={<Check size={14} />}
            title="Concluir"
            size="sm"
            onClick={() => onComplete(task)}
          />
          <IconButton
            icon={<Play size={14} fill="currentColor" />}
            title="Iniciar"
            size="sm"
            onClick={() => onPlay(task)}
          />
        </>
      }
    />
  );
}

// ─── Main popup content ───────────────────────────────────────────────────────

export function PopupOverlayContent({
  runningTask,
  activePlannedTaskActions,
  onNavigatePlanning,
  onResize,
  onModalOpenChange,
  onStartTask,
  onPlay,
  onPause,
  onResume,
  onStop,
  onCancel,
  onUpdateTask,
}: PopupOverlayContentProps) {
  const today = todayISO();
  const { tasks, reload, complete, update } = usePlannedTasksForDate(today);
  const { plannedIds: trackedIds } = useTrackedMeetingPlannedIds();
  const {
    groups: completedGroups,
    totalSeconds: completedTotalSeconds,
    updateGroup: updateCompletedGroup,
  } = useCompletedTasksForDate(today);
  const { projects } = useProjects();
  const { categories } = useCategories();
  const { activeFields } = useCustomFields();
  const pending = tasks.filter((t) => !t.completedDates.includes(today));
  // Com um grupo só, o rótulo é ruído sobre uma lista que já é homogênea.
  const { timed, untimed } = groupPlannedBySchedule(pending);
  const showHeadings = timed.length > 0 && untimed.length > 0;
  const [activeTab, setActiveTab] = useState<"planned" | "completed">("planned");

  const [confirmingStop, setConfirmingStop] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannedTask | null>(null);
  const [editingCompleted, setEditingCompleted] = useState<TaskGroup | null>(null);
  const [editingRunning, setEditingRunning] = useState(false);

  // Reset confirm state whenever the running task changes (started/stopped).
  // O painel da execução vai junto: sem tarefa ele editaria o que já não está em
  // execução, e o `Salvar` gravaria numa tarefa parada por outra janela.
  useEffect(() => {
    if (!runningTask) {
      setConfirmingStop(false);
      setEditingRunning(false);
    }
  }, [runningTask?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Os três painéis seguram o fechamento automático pelo mesmo motivo: o popup
  // some no blur, e todos eles guardam texto digitado que ninguém salvou ainda.
  useEffect(() => {
    onModalOpenChange(!!editingTask || !!editingCompleted || editingRunning);
  }, [editingTask, editingCompleted, editingRunning, onModalOpenChange]);

  // A janela é dimensionada **uma vez**, e não por estado: a altura é a mesma em
  // todo estado, e crescer a janela para editar tiraria o overlay do lugar onde
  // o usuário o deixou.
  useEffect(() => {
    onResize(POPUP_W, POPUP_SIZE.height);
  }, [onResize]);

  async function handlePlay(task: PlannedTask) {
    await onPlay(task);
    await reload();
  }

  async function handleRepeat(group: TaskGroup) {
    const t = group.tasks[0];
    await onStartTask({
      name: t.name,
      projectId: t.projectId,
      categoryId: t.categoryId,
      billable: t.billable,
    });
  }

  async function handleOpenApp() {
    await emit(OVERLAY_EVENTS.OVERLAY_OPEN_APP);
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-canvas border border-border rounded-card shadow-2xl overflow-visible">
      {/* Header. Não há botão de fechar: o popup some no ESC e ao perder o foco,
          e o espaço vale mais para o "Abrir app", que não tem outro caminho. */}
      <div
        className="flex items-center justify-between gap-1 px-3 bg-surface border-b border-border shrink-0 rounded-t-card overflow-hidden"
        style={{ height: HEADER_H }}
      >
        <div className="min-w-0 flex items-center gap-1">
          <OverlayWorkspaceChip runningTask={runningTask} onStop={onStop} />
          <button
            onClick={onNavigatePlanning}
            title="Ir para planejamento"
            className="p-1 text-fg-secondary hover:text-fg hover:bg-border rounded-control transition-colors"
          >
            <CalendarDays size={14} />
          </button>
        </div>
        <button
          onClick={handleOpenApp}
          className="shrink-0 flex items-center gap-1 text-sm text-fg-muted hover:text-fg-secondary transition-colors"
        >
          Abrir app
          <ArrowRight size={14} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border-subtle shrink-0" style={{ height: TABS_H }}>
        <button
          onClick={() => setActiveTab("planned")}
          className={`flex-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "planned"
              ? "text-fg border-accent"
              : "text-fg-muted border-transparent hover:text-fg-secondary"
          }`}
        >
          Planejadas · {pending.length}
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "completed"
              ? "text-fg border-accent"
              : "text-fg-muted border-transparent hover:text-fg-secondary"
          }`}
        >
          Executadas · {completedGroups.length}
        </button>
      </div>

      {/* Conteúdo da aba ativa: o único `flex-1` do corpo, e por isso o que cede
          altura quando o card da execução aparece ou cresce. */}
      <div className="flex-1 min-h-0">
        {activeTab === "planned" ? (
          <div className="h-full overflow-y-auto">
            {pending.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-center text-fg-muted text-xs">Nenhuma tarefa pendente</p>
              </div>
            ) : (
              <>
                {showHeadings && <SectionHeading>Com hora de início</SectionHeading>}
                {timed.map((task) => (
                  <PlannedRow
                    key={task.id}
                    task={task}
                    projects={projects}
                    categories={categories}
                    tracked={trackedIds.has(task.id)}
                    onEdit={setEditingTask}
                    onComplete={(t) => void complete(t.id, today)}
                    onPlay={handlePlay}
                  />
                ))}
                {showHeadings && <SectionHeading>Sem hora definida</SectionHeading>}
                {untimed.map((task) => (
                  <PlannedRow
                    key={task.id}
                    task={task}
                    projects={projects}
                    categories={categories}
                    tracked={trackedIds.has(task.id)}
                    onEdit={setEditingTask}
                    onComplete={(t) => void complete(t.id, today)}
                    onPlay={handlePlay}
                  />
                ))}
              </>
            )}
          </div>
        ) : (
          <CompletedTasksSection
            groups={completedGroups}
            totalSeconds={completedTotalSeconds}
            projects={projects}
            categories={categories}
            onRepeat={handleRepeat}
            onEdit={setEditingCompleted}
          />
        )}
      </div>

      {/* Rodapé: o card da execução ou o "Nova tarefa", nunca os dois. O botão
          ficar **fora** do estado running é de propósito — `handleStartTask` não
          tem a guarda de tarefa em execução que o `handlePlay` tem, e o que hoje
          impede a segunda tarefa é ele não existir enquanto uma roda. */}
      {runningTask ? (
        <RunningCard
          task={runningTask}
          actions={activePlannedTaskActions}
          confirmingStop={confirmingStop}
          setConfirmingStop={setConfirmingStop}
          onEdit={() => setEditingRunning(true)}
          onPause={onPause}
          onResume={onResume}
          onStop={onStop}
          onCancel={onCancel}
        />
      ) : (
        <div
          className="flex items-center px-3 border-t border-border/60 shrink-0"
          style={{ height: FOOTER_H }}
        >
          <Button
            variant="ghost"
            icon={<Play size={10} fill="currentColor" />}
            onClick={() => onStartTask({ billable: true })}
          >
            Nova tarefa
          </Button>
        </div>
      )}

      {/* Edição da planejada sem sair do overlay e sem mexer no tamanho da
          janela. Os campos são os do modal do planejamento, pelo mesmo
          `usePlannedTaskEditor` — só a disposição muda (§9.4). */}
      {editingTask && (
        <PlannedTaskEditSheet
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={update}
          onClose={() => setEditingTask(null)}
        />
      )}

      {/* Edição da executada, no mesmo desenho de painel. Ela edita o **grupo**
          que a linha representa (§6.3) — os campos da chave valem para todas as
          irmãs, e só o grupo de uma tarefa mostra horário. */}
      {editingCompleted && (
        <CompletedTaskEditSheet
          group={editingCompleted}
          projects={projects}
          categories={categories}
          onSave={updateCompletedGroup}
          onClose={() => setEditingCompleted(null)}
        />
      )}

      {/* Tudo o que a tarefa em execução tem além do cronômetro, no mesmo
          desenho de painel e pela mesma razão: a janela não cresce. */}
      {editingRunning && runningTask && (
        <RunningTaskEditSheet
          task={runningTask}
          projects={projects}
          categories={categories}
          customFields={activeFields}
          actions={activePlannedTaskActions}
          onSave={onUpdateTask}
          onClose={() => setEditingRunning(false)}
        />
      )}
    </div>
  );
}
