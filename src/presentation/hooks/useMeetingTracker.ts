import { useEffect, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { computeMeetingPromptActions } from "@domain/usecases/calendar/computeMeetingPromptActions";
import { syncTodayMeetings } from "@domain/usecases/calendar/syncTodayMeetings";
import {
  OVERLAY_EVENTS,
  type MeetingPromptPayload,
  type MeetingPromptResponsePayload,
  type RunningTaskChangedPayload,
} from "@shared/types/overlayEvents";
import { endOfDayISO, startOfDayISO, todayISO } from "@shared/utils/time";

const TICK_MS = 60_000;
const SYNC_INTERVAL_MS = 30 * 60 * 1000;
// Antecedência do prompt de início: aparece até 1 min antes do horário do evento
// para o usuário entrar na reunião já com a tarefa rodando.
const START_LEAD_MS = 60_000;
// Atraso do primeiro tick para dar tempo de a janela overlay-popup (persistente,
// criada oculta no startup) registrar o listener de MEETING_PROMPT antes de o
// primeiro prompt ser emitido — evita perder o prompt logo na abertura do app.
const INITIAL_TICK_DELAY_MS = 4000;

/**
 * Orquestra o rastreamento automático de reuniões do Google Agenda. Deve rodar
 * dentro do RunningTaskProvider (usa startTask/stopTask). Toda a decisão de
 * negócio vive em use cases de domínio (syncTodayMeetings, computeMeetingPromptActions);
 * este hook apenas agenda ticks, emite prompts e aplica a resposta do usuário.
 */
export function useMeetingTracker() {
  const config = useAppConfig();
  const { createCalendarImporter } = useIntegrations();
  const { trackedMeetingRepo, plannedTaskRepo, projectRepo, categoryRepo } = useRepositories();
  const { runningTask, switchToTask, stopTask } = useRunningTask();

  // Refs para uso dentro de intervalos/handlers sem stale closures.
  const runningTaskRef = useRef(runningTask);
  runningTaskRef.current = runningTask;
  const switchRef = useRef(switchToTask);
  switchRef.current = switchToTask;
  const stopRef = useRef(stopTask);
  stopRef.current = stopTask;

  useEffect(() => {
    if (!config.isLoaded) return;

    let disposed = false;
    let inFlight = false;
    let lastSyncMs = 0;

    const enabled = () =>
      config.get("calendarAutoTrackingEnabled") && !!config.get("googleRefreshToken");

    async function runSync() {
      const today = todayISO();
      const result = await syncTodayMeetings(
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
        }
      ).catch(() => null); // busca é best-effort (rede/token)
      // Novas planejadas criadas → avisa a UI para atualizar a lista ao vivo.
      if (result && result.plannedCreated > 0) {
        await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      }
    }

    async function runPromptCheck() {
      const meetings = await trackedMeetingRepo.listForDate(todayISO());
      const [action] = computeMeetingPromptActions(new Date().toISOString(), meetings, {
        startLeadMs: START_LEAD_MS,
      });
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

    async function tick() {
      if (disposed || inFlight || !enabled()) return;
      // Guarda de re-entrância: se o trabalho assíncrono de um tick exceder TICK_MS,
      // impede que o próximo tick leia/emita antes do upsert do anterior (evita
      // prompt duplicado e double-increment de endPromptCount).
      inFlight = true;
      try {
        const nowMs = Date.now();
        if (nowMs - lastSyncMs >= SYNC_INTERVAL_MS) {
          lastSyncMs = nowMs;
          await runSync();
        }
        await runPromptCheck();
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

      // Copia projeto/categoria da PlannedTask de mesmo nome, se houver.
      const planned = await plannedTaskRepo.findForDate(today);
      const match = planned.find(
        (p) => p.name.toLowerCase().trim() === m.title.toLowerCase().trim()
      );
      const task = await switchRef.current({
        name: m.title,
        projectId: match?.projectId ?? null,
        categoryId: match?.categoryId ?? null,
        billable: match?.billable ?? false,
        plannedTaskId: match?.id ?? null,
      });
      if (task) await trackedMeetingRepo.upsert({ ...m, startedTaskId: task.id });
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
      // "still-going": nada a fazer — lastEndPromptAt já foi marcado ao emitir.
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

    const initialTimer = setTimeout(() => void tick(), INITIAL_TICK_DELAY_MS);
    const interval = setInterval(() => void tick(), TICK_MS);

    return () => {
      disposed = true;
      clearTimeout(initialTimer);
      clearInterval(interval);
      unlistenResponse.then((fn) => fn());
      unlistenRunningChanged.then((fn) => fn());
    };
    // createCalendarImporter e os repos vêm de Providers e são estáveis por sessão;
    // capturá-los uma vez no mount é seguro (§9.2).
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps
}
