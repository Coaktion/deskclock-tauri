import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { computeMeetingPromptActions } from "@domain/usecases/calendar/computeMeetingPromptActions";
import { resolveMeetingTaskDefaults } from "@domain/usecases/calendar/resolveMeetingTaskDefaults";
import { syncTodayMeetings } from "@domain/usecases/calendar/syncTodayMeetings";
import {
  OVERLAY_EVENTS,
  type MeetingPromptPayload,
  type MeetingPromptResponsePayload,
  type MeetingTrackerSyncResultPayload,
  type RunningTaskChangedPayload,
} from "@shared/types/overlayEvents";
import { truncateError } from "@shared/utils/syncError";
import { endOfDayISO, startOfDayISO, todayISO } from "@shared/utils/time";
import { showToast } from "@shared/utils/toast";

const TICK_MS = 60_000;
// Intervalo de re-busca da agenda. Curto de propósito: a cada sync o
// syncTodayMeetings reconcilia reuniões remarcadas/canceladas, então quanto
// mais frequente, menor a janela em que um prompt dispara em horário obsoleto.
const SYNC_INTERVAL_MS = 2 * 60 * 1000;
// Antecedência do prompt de início: aparece até 1 min antes do horário do evento
// para o usuário entrar na reunião já com a tarefa rodando.
const START_LEAD_MS = 60_000;
// Cadência de re-pergunta do início após "Adiar por 5 min" (ou se ignorado).
const START_REPROMPT_MS = 5 * 60 * 1000;
// Atraso do primeiro tick para dar tempo de a janela overlay-popup (persistente,
// criada oculta no startup) registrar o listener de MEETING_PROMPT antes de o
// primeiro prompt ser emitido — evita perder o prompt logo na abertura do app.
const INITIAL_TICK_DELAY_MS = 4000;

/**
 * Orquestra o rastreamento de reuniões do Google Agenda. Deve rodar dentro do
 * RunningTaskProvider (usa startTask/stopTask). Toda a decisão de negócio vive em
 * use cases de domínio (syncTodayMeetings, computeMeetingPromptActions); este hook
 * apenas agenda ticks, emite prompts e aplica a resposta do usuário.
 *
 * **São dois interruptores, não um.** Buscar a agenda é o que o toggle de
 * rastreamento automático liga; avisar sobre reunião **já rastreada** só depende
 * do Google estar conectado — senão a reunião semeada pelo import manual ficaria
 * inerte no banco. O preço é declarado: sem descoberta não há reconcile, então
 * reunião cancelada ou remarcada no Google ainda avisa no horário antigo.
 */
export function useMeetingTracker() {
  const config = useAppConfig();
  const { createCalendarImporter } = useIntegrations();
  const { trackedMeetingRepo, plannedTaskRepo, projectRepo, categoryRepo } = useRepositories();
  const { activeWorkspaceId: workspaceId, loading: workspaceLoading } = useWorkspaces();
  const { runningTask, activePlannedTaskId, switchToTask, stopTask } = useRunningTask();

  // Refs para uso dentro de intervalos/handlers sem stale closures.
  const runningTaskRef = useRef(runningTask);
  runningTaskRef.current = runningTask;
  // De qual planejada a execução partiu. Não vive na Task: é o contexto que
  // guarda, e é o sinal forte para reconhecer a reunião iniciada à mão.
  const activePlannedIdRef = useRef(activePlannedTaskId);
  activePlannedIdRef.current = activePlannedTaskId;
  const switchRef = useRef(switchToTask);
  switchRef.current = switchToTask;
  const stopRef = useRef(stopTask);
  stopRef.current = stopTask;
  // O efeito abaixo roda uma vez e captura o closure; sem o ref, o workspace
  // congelaria no que estava ativo na montagem e toda reunião rastreada depois
  // de uma troca cairia no workspace errado.
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  // Enquanto o WorkspaceContext carrega, o id ativo é o do workspace "Padrão" —
  // um palpite, não uma escolha. O primeiro ciclo dispara poucos segundos após o
  // mount, e sincronizar antes da resolução criaria planejada no workspace errado.
  // O gate é no efeito, não no `enabled()`: barrar dentro do tick só adiaria o
  // ciclo para o próximo intervalo, e aqui o efeito reexecuta quando resolve.
  useEffect(() => {
    if (!config.isLoaded || workspaceLoading) return;

    let disposed = false;
    let inFlight = false;
    let lastSyncMs = 0;
    let lastPrunedDay = "";

    /**
     * Buscar a agenda. É o que o toggle de rastreamento automático governa —
     * varrer o Google de dois em dois minutos é o que ele liga e desliga.
     */
    const discoveryEnabled = () =>
      config.get("calendarAutoTrackingEnabled") && !!config.get("googleRefreshToken");
    /**
     * Avisar sobre reunião já rastreada. Não depende do toggle: o import manual
     * também semeia reuniões, e mantê-las atrás da chave da descoberta as deixaria
     * inertes no banco — o usuário liga o rastreamento na importação e nada avisa.
     */
    const trackingEnabled = () => !!config.get("googleRefreshToken");

    async function runSync() {
      const today = todayISO();
      let result: Awaited<ReturnType<typeof syncTodayMeetings>> | null = null;
      // A busca é best-effort (rede/token) e não pode derrubar o intervalo, mas
      // engolir a falha sem rastro torna "a reunião não virou planejada"
      // indiagnosticável — o resultado é publicado e a tela de Integrações o mostra.
      let failure = "";
      try {
        result = await syncTodayMeetings(
          {
            importer: createCalendarImporter(),
            trackedRepo: trackedMeetingRepo,
            plannedRepo: plannedTaskRepo,
            projectRepo,
            categoryRepo,
          },
          {
            todayISO: today,
            fromISO: startOfDayISO(today),
            toISO: endOfDayISO(today),
            nowISO: new Date().toISOString(),
            workspaceId: workspaceIdRef.current,
          }
        );
        // Falha por reunião não aborta o ciclo; a primeira mensagem basta para
        // apontar a causa, e a reunião sem vínculo é retentada no próximo ciclo.
        failure = result.errors[0] ?? "";
      } catch (err: unknown) {
        failure = err instanceof Error ? err.message : String(err);
        console.error("[meetingTracker] falha no ciclo de rastreamento", err);
      }

      failure = truncateError(failure);
      // Escrever só na mudança: o ciclo roda a cada 2 min e gravar sempre seria um
      // UPDATE no SQLite por ciclo, para sempre, sem nada de novo para dizer.
      if (config.get("calendarLastSyncError") !== failure) {
        await config.set("calendarLastSyncError", failure);
      }
      await emit(OVERLAY_EVENTS.MEETING_TRACKER_SYNC_RESULT, {
        tracked: result?.tracked ?? 0,
        plannedCreated: result?.plannedCreated ?? 0,
        plannedLinked: result?.plannedLinked ?? 0,
        error: failure,
      } satisfies MeetingTrackerSyncResultPayload);

      // Planejada criada, adotada (que ganha a ação do Meet) ou com o horário
      // alinhado ao evento → refresh da lista. O alinhamento entra na conta porque
      // muda a linha de seção no popup: ganhando hora ela sai de "Sem hora".
      // Vale também no ciclo parcial: o que foi criado antes da falha está gravado.
      if (result && result.plannedCreated + result.plannedLinked + result.plannedRetimed > 0) {
        await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      }
      return result;
    }

    async function runTrackingCheck() {
      const meetings = await trackedMeetingRepo.listForDate(todayISO());
      const running = runningTaskRef.current;
      const actions = computeMeetingPromptActions(new Date().toISOString(), meetings, {
        startLeadMs: START_LEAD_MS,
        startRepromptMs: START_REPROMPT_MS,
        runningTask: running
          ? {
              id: running.id,
              name: running.name,
              plannedTaskId: activePlannedIdRef.current,
              startTimeISO: running.startTime,
            }
          : null,
      });

      // Reunião iniciada à mão: grava o vínculo com a tarefa em curso. Escrita
      // estreita, não upsert — o snapshot acima é anterior ao `plannedTaskId`
      // que o sync deste mesmo tick pode ter acabado de gravar.
      for (const action of actions) {
        if (action.kind === "attach") {
          await trackedMeetingRepo.setStartedTaskId(action.meeting.calendarEventId, action.taskId);
        }
      }

      // Um prompt por tick, como antes. `attach` nunca coexiste com o `start` da
      // mesma reunião, então nada de perguntar sobre o que acabou de ser anexado.
      const action = actions.find((a) => a.kind === "start" || a.kind === "end");
      if (!action) return;

      const m = action.meeting;
      const nowISO = new Date().toISOString();
      // Marca o estado ANTES de emitir para não repetir o prompt no próximo tick.
      if (action.kind === "start") {
        await trackedMeetingRepo.upsert({ ...m, startPromptedAt: nowISO });
      } else {
        await trackedMeetingRepo.upsert({
          ...m,
          endPromptCount: m.endPromptCount + 1,
          lastEndPromptAt: nowISO,
        });
      }
      await emit(OVERLAY_EVENTS.MEETING_PROMPT, {
        kind: action.kind,
        calendarEventId: m.calendarEventId,
        title: m.title,
      } satisfies MeetingPromptPayload);
    }

    /**
     * Apaga as reuniões de dias passados quando a descoberta está desligada.
     *
     * Com ela ligada, quem poda é o `syncTodayMeetings` ao fim de cada ciclo. Sem
     * ela, nada podaria — e as reuniões semeadas pelo import manual ficariam no
     * banco para sempre. Uma vez por dia basta: a poda apaga por data, e repeti-la
     * a cada minuto seria um DELETE que nunca acha nada.
     */
    async function pruneStaleMeetings(today: string) {
      if (lastPrunedDay === today) return;
      try {
        await trackedMeetingRepo.pruneBefore(today);
        lastPrunedDay = today;
      } catch (err: unknown) {
        // Poda é higiene: falhar aqui não pode derrubar a checagem de prompts.
        console.error("[meetingTracker] falha ao podar reuniões passadas", err);
      }
    }

    async function tick() {
      if (disposed || inFlight || !trackingEnabled()) return;
      // Guarda de re-entrância: se o trabalho assíncrono de um tick exceder TICK_MS,
      // impede que o próximo tick leia/emita antes do upsert do anterior (evita
      // prompt duplicado e double-increment de endPromptCount).
      inFlight = true;
      try {
        const nowMs = Date.now();
        if (discoveryEnabled()) {
          if (nowMs - lastSyncMs >= SYNC_INTERVAL_MS) {
            lastSyncMs = nowMs;
            await runSync();
          }
        } else {
          await pruneStaleMeetings(todayISO());
        }
        await runTrackingCheck();
      } finally {
        inFlight = false;
      }
    }

    async function handleStartResponse(calendarEventId: string) {
      const today = todayISO();
      const meetings = await trackedMeetingRepo.listForDate(today);
      const m = meetings.find((mm) => mm.calendarEventId === calendarEventId);
      if (!m) return;

      // Se outra reunião está em execução, encerra o rastreamento dela.
      const running = runningTaskRef.current;
      if (running) {
        const prev = meetings.find((mm) => mm.startedTaskId === running.id && !mm.ended);
        if (prev) await trackedMeetingRepo.upsert({ ...prev, ended: true });
      }

      // Projeto, categoria, campos personalizados e vínculo saem da planejada de
      // origem — a vinculada pelo sync, ou, se ela for de outro workspace, a de
      // mesmo nome no ativo.
      // A regra vive num use case porque é ela que decide o que a tarefa herda,
      // e aqui dentro do efeito não havia como testá-la.
      const defaults = await resolveMeetingTaskDefaults(plannedTaskRepo, {
        title: m.title,
        plannedTaskId: m.plannedTaskId,
        todayISO: today,
        workspaceId: workspaceIdRef.current,
      });
      const task = await switchRef.current({ name: m.title, ...defaults });
      // Escrita estreita: entre a leitura de `m` acima e este ponto houve uma
      // troca de tarefa (parada + início), tempo de sobra para um ciclo de sync
      // gravar o `plannedTaskId` que um upsert de linha inteira desfaria.
      if (task) await trackedMeetingRepo.setStartedTaskId(m.calendarEventId, task.id);
    }

    async function handleResponse(payload: MeetingPromptResponsePayload) {
      const meetings = await trackedMeetingRepo.listForDate(todayISO());
      const m = meetings.find((mm) => mm.calendarEventId === payload.calendarEventId);
      if (payload.action === "start") {
        await handleStartResponse(payload.calendarEventId);
      } else if (payload.action === "dismiss") {
        if (m) await trackedMeetingRepo.upsert({ ...m, startDismissed: true });
      } else if (payload.action === "stop") {
        await stopRef.current(true);
        if (m) await trackedMeetingRepo.upsert({ ...m, ended: true });
      }
      // "snooze": nada a fazer — startPromptedAt já foi marcado ao emitir; o
      // startRepromptMs reapresenta em 5 min. "still-going": idem para o fim.
    }

    // Busca manual disparada pelo botão "Buscar eventos agora" nas Configurações.
    // O botão fica travado até o evento de resultado chegar, então **todo** caminho
    // de saída precisa publicá-lo — inclusive os que não fazem busca nenhuma.
    // Este caminho **busca** a agenda, então continua exigindo o toggle: é ele que
    // governa a descoberta, e a mensagem abaixo é a que diz isso ao usuário.
    async function handleSyncNow() {
      if (disposed || inFlight || !discoveryEnabled()) {
        await emit(OVERLAY_EVENTS.MEETING_TRACKER_SYNC_RESULT, {
          tracked: 0,
          plannedCreated: 0,
          plannedLinked: 0,
          error: inFlight ? "" : "Conecte o Google e ative o rastreamento de reuniões.",
        } satisfies MeetingTrackerSyncResultPayload);
        return;
      }
      inFlight = true;
      try {
        lastSyncMs = Date.now();
        const result = await runSync();
        await runTrackingCheck();
        const tracked = result?.tracked ?? 0;
        if (tracked > 0) await showToast("success", `${tracked} reunião(ões) rastreada(s)`);
        else await showToast("info", "Nenhum evento novo na agenda de hoje");
      } finally {
        inFlight = false;
      }
    }

    // Encerramento do rastreamento: qualquer caminho de parada (janela principal,
    // atalho global, popup ou cancelamento) emite RUNNING_TASK_CHANGED com task
    // null. TASK_STOPPED só é emitido pelo popup, então RUNNING_TASK_CHANGED é a
    // única fonte que cobre todos os caminhos. Ao trocar de tarefa via switchToTask
    // o payload traz a nova task (não null), então não encerra indevidamente.
    async function handleRunningTaskChanged(payload: RunningTaskChangedPayload) {
      if (payload.task !== null) return;
      const meetings = await trackedMeetingRepo.listForDate(todayISO());
      for (const m of meetings) {
        if (m.startedTaskId && !m.ended) {
          await trackedMeetingRepo.upsert({ ...m, ended: true });
        }
      }
    }

    const unlistenResponse = listen<MeetingPromptResponsePayload>(
      OVERLAY_EVENTS.MEETING_PROMPT_RESPONSE,
      ({ payload }) => void handleResponse(payload)
    );
    const unlistenRunningChanged = listen<RunningTaskChangedPayload>(
      OVERLAY_EVENTS.RUNNING_TASK_CHANGED,
      ({ payload }) => void handleRunningTaskChanged(payload)
    );
    const unlistenSyncNow = listen(
      OVERLAY_EVENTS.MEETING_TRACKER_SYNC_NOW,
      () => void handleSyncNow()
    );

    const initialTimer = setTimeout(() => void tick(), INITIAL_TICK_DELAY_MS);
    const interval = setInterval(() => void tick(), TICK_MS);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      unlistenResponse.then((fn) => fn());
      unlistenRunningChanged.then((fn) => fn());
      unlistenSyncNow.then((fn) => fn());
    };
    // createCalendarImporter e os repos vêm de Providers e são estáveis por sessão;
    // capturá-los uma vez no mount é seguro (§9.2).
    // `workspaceLoading` faz true→false uma vez por mount, então é uma
    // reexecução só — e é ela que faz o primeiro ciclo contar da resolução.
  }, [config.isLoaded, workspaceLoading]); // eslint-disable-line react-hooks/exhaustive-deps
}
