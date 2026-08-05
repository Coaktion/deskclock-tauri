import type { CalendarEvent, ICalendarImporter } from "@domain/integrations/ICalendarImporter";
import type { ITrackedMeetingRepository } from "@domain/integrations/ITrackedMeetingRepository";
import type { TrackedMeeting } from "@domain/integrations/TrackedMeeting";
import type { Category } from "@domain/entities/Category";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import {
  createPlannedTaskFromEvent,
  openUrlAction,
} from "@domain/usecases/plannedTasks/ImportCalendarEvents";
import { findByNameCaseInsensitive, parseCalendarMetadata } from "@shared/utils/calendarMetadata";
import { composeLocalISO, composeMeetingEndISO } from "./meetingTime";
import { nameKey } from "./nameKey";

export interface SyncTodayMeetingsDeps {
  importer: ICalendarImporter;
  trackedRepo: ITrackedMeetingRepository;
  plannedRepo: IPlannedTaskRepository;
  projectRepo: IProjectRepository;
  categoryRepo: ICategoryRepository;
}

export interface SyncTodayMeetingsResult {
  /** Quantos eventos novos foram rastreados. */
  tracked: number;
  /** Quantas PlannedTasks foram criadas (para o chamador emitir refresh da lista). */
  plannedCreated: number;
  /** Quantas reuniões adotaram uma planejada que já existia, em vez de criar outra. */
  plannedLinked: number;
  /**
   * Falhas por reunião, uma mensagem cada. O ciclo **não** aborta: a reunião que
   * falhou fica sem vínculo e é tentada de novo no ciclo seguinte, e o chamador
   * registra a mensagem em vez de perder o rastro.
   */
  errors: string[];
}

type PlannedOutcome = Pick<SyncTodayMeetingsResult, "plannedCreated" | "plannedLinked" | "errors">;

export interface SyncTodayMeetingsRange {
  /** Data local "YYYY-MM-DD" de hoje. */
  todayISO: string;
  /** Início do intervalo de busca (ISO datetime). */
  fromISO: string;
  /** Fim do intervalo de busca (ISO datetime). */
  toISO: string;
  /** Momento atual (ISO) — usado como createdAt das PlannedTasks. */
  nowISO: string;
  /** Workspace que recebe as planejadas criadas e cujo catálogo é consultado. */
  workspaceId: string;
}

/**
 * Busca os eventos com horário do dia no Google Agenda e:
 * 1. Rastreia (upsert) eventos NOVOS — sem sobrescrever o estado de rastreamento
 *    de eventos já conhecidos (evita perder prompt/started/dismiss).
 * 2. Reconcilia reuniões já rastreadas contra a agenda atual: remarcações no
 *    mesmo dia atualizam o horário (e reabrem o prompt no horário novo);
 *    reuniões que sumiram de hoje (canceladas ou movidas para outro dia) e ainda
 *    não iniciadas são removidas, para não notificar um horário que não existe mais.
 * 3. Garante a PlannedTask de cada reunião rastreada sem vínculo (ver
 *    {@link ensurePlannedTasks}).
 * 4. Poda reuniões rastreadas de dias anteriores.
 *
 * **Rastrear e planejar são etapas separadas de propósito.** Enquanto a criação
 * da planejada vivia dentro do laço que rastreia, ela só acontecia para evento
 * novo *naquele ciclo*: o upsert do rastreamento gravava primeiro, e uma falha
 * na criação deixava o evento marcado como visto para sempre — o prompt
 * disparava no horário e a planejada nunca aparecia. Agora a etapa 3 parte do
 * estado do banco, então uma falha é apenas nova tentativa no ciclo seguinte.
 *
 * Projeto e categoria são pré-preenchidos a partir da descrição do evento
 * (mesma convenção do modal manual: "Projeto:" / "Categoria:"), casando por nome
 * contra os cadastros existentes.
 */
export async function syncTodayMeetings(
  deps: SyncTodayMeetingsDeps,
  range: SyncTodayMeetingsRange
): Promise<SyncTodayMeetingsResult> {
  const { importer, trackedRepo, projectRepo, categoryRepo } = deps;
  const { todayISO, fromISO, toISO, workspaceId } = range;

  const [events, existing, projects, categories] = await Promise.all([
    importer.getEvents(fromISO, toISO),
    trackedRepo.listForDate(todayISO),
    projectRepo.findAll(workspaceId),
    categoryRepo.findAll(workspaceId),
  ]);

  const existingIds = new Set(existing.map((m) => m.calendarEventId));
  const timed = events.filter((e) => !e.allDay && !!e.startTime);
  const timedById = new Map(timed.map((e) => [e.id, e]));

  // Reconcilia o que já era rastreado contra a agenda atual (remarcações/cancelamentos).
  // Devolve o estado **já reconciliado**, e é dele que sai a lista de pendentes:
  // partir de `existing` gravaria o vínculo sobre o snapshot antigo e desfaria a
  // remarcação que acabou de ser aplicada.
  const reconciled = await reconcileTracked(trackedRepo, existing, timedById);

  // Reunião sem planejada, seja recém-rastreada ou herdada de um ciclo que falhou
  // antes de criá-la. Sem evento na agenda fica de fora: não há de onde tirar
  // horário nem link. A que sumiu e não foi iniciada já saiu no reconcile acima.
  const pending: PendingMeeting[] = reconciled
    .filter((m) => !m.plannedTaskId && timedById.has(m.calendarEventId))
    .map((m) => ({ calendarEventId: m.calendarEventId, event: timedById.get(m.calendarEventId)! }));

  let tracked = 0;
  for (const event of timed) {
    if (existingIds.has(event.id)) continue;

    const meeting: TrackedMeeting = {
      calendarEventId: event.id,
      date: event.date,
      title: event.title,
      startISO: composeLocalISO(event.date, event.startTime!),
      endISO: event.endTime
        ? composeMeetingEndISO(event.date, event.startTime!, event.endTime)
        : null,
      startedTaskId: null,
      plannedTaskId: null,
      startPromptedAt: null,
      startDismissed: false,
      endPromptCount: 0,
      lastEndPromptAt: null,
      ended: false,
    };
    await trackedRepo.upsert(meeting);
    tracked++;
    pending.push({ calendarEventId: event.id, event });
  }

  const planned = await ensurePlannedTasks(deps, range, pending, projects, categories);

  await trackedRepo.pruneBefore(todayISO);
  return { tracked, ...planned };
}

/**
 * Reunião rastreada que ainda não tem planejada, emparelhada com seu evento.
 *
 * Carrega o **id**, não o `TrackedMeeting` inteiro: o vínculo é gravado por
 * `setPlannedTaskId`, e ter o snapshot à mão aqui só convidaria a voltar a
 * escrever a linha inteira a partir dele — que é justamente o que revertia o
 * `startedTaskId` gravado pelo prompt.
 */
interface PendingMeeting {
  calendarEventId: string;
  event: CalendarEvent;
}

/**
 * Dá a cada reunião rastreada de hoje a sua PlannedTask, e grava o vínculo.
 *
 * Recebe **toda** reunião do dia sem vínculo, não só a recém-rastreada: é isso
 * que recupera a reunião que ficou sem planejada num ciclo anterior, e o que
 * torna a etapa retentável em vez de uma janela única.
 *
 * Duas saídas por reunião:
 * - **Adota** a planejada de mesmo nome que já existe no dia — inclusive uma
 *   importada do Monday. Sem isso, item do Monday e convite da agenda para o
 *   mesmo trabalho viram duas linhas no planejamento, uma com o link do Meet e
 *   outra com o Project Stage. Ao adotar, a ação de abrir a reunião é somada à
 *   planejada existente, para não custar o link.
 * - **Cria** uma, quando não há nada de mesmo nome, e grava o vínculo logo
 *   depois. Um erro na terceira reunião não desfaz as duas primeiras nem marca a
 *   terceira como resolvida.
 *
 * Reunião com vínculo preenchido não é reavaliada, nem que a planejada tenha sido
 * apagada: planejada apagada à mão não volta. Como a poda diária só mantém o dia
 * corrente, uma recorrente volta a ser avaliada na próxima ocorrência.
 */
async function ensurePlannedTasks(
  { trackedRepo, plannedRepo }: SyncTodayMeetingsDeps,
  { todayISO, nowISO, workspaceId }: SyncTodayMeetingsRange,
  pending: PendingMeeting[],
  projects: Project[],
  categories: Category[]
): Promise<PlannedOutcome> {
  if (pending.length === 0) return { plannedCreated: 0, plannedLinked: 0, errors: [] };

  const plannedToday = await plannedRepo.findForDate(todayISO, workspaceId);
  const byName = new Map(plannedToday.map((t) => [nameKey(t.name), t]));

  let plannedCreated = 0;
  let plannedLinked = 0;
  const errors: string[] = [];

  // O nome vem do evento, não da reunião rastreada: o reconcile pode ter
  // renomeado o evento neste mesmo ciclo, e a agenda é a fonte da verdade.
  for (const { calendarEventId, event } of pending) {
    // Uma reunião que falha não pode levar as seguintes: sem o try, um erro na
    // terceira deixaria a quarta e a quinta sem planejada até o ciclo seguinte.
    try {
      const adoptable = byName.get(nameKey(event.title));

      if (adoptable) {
        await adoptPlannedTask(plannedRepo, adoptable, event);
        await trackedRepo.setPlannedTaskId(calendarEventId, adoptable.id);
        plannedLinked++;
        continue;
      }

      const meta = parseCalendarMetadata(event.description);
      const created = await createPlannedTaskFromEvent(
        plannedRepo,
        {
          event,
          projectId: findByNameCaseInsensitive(meta.projectName, projects)?.id ?? null,
          categoryId: findByNameCaseInsensitive(meta.categoryName, categories)?.id ?? null,
          scheduleType: "specific_date",
          recurringDays: [],
        },
        nowISO,
        workspaceId,
        true
      );
      // Duas reuniões de mesmo nome no dia compartilham uma planejada.
      byName.set(nameKey(created.name), created);
      await trackedRepo.setPlannedTaskId(calendarEventId, created.id);
      plannedCreated++;
    } catch (err: unknown) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { plannedCreated, plannedLinked, errors };
}

/**
 * Soma à planejada adotada a ação de entrar na reunião, se ela ainda não tiver.
 *
 * **Só o link de conferência, nunca o `htmlLink` do evento.** A planejada adotada
 * costuma ser de longa vida — recorrente, ou de período, como as que a importação
 * do Monday cria —, e o rastreamento é podado todo dia: amanhã a mesma reunião
 * volta a adotá-la. O `htmlLink` é único por ocorrência, então o dedupe abaixo
 * nunca casaria e a planejada acumularia uma ação por dia, indefinidamente. O link
 * de conferência de uma recorrente é o mesmo em toda ocorrência, e é o único que
 * serve para entrar na reunião.
 */
async function adoptPlannedTask(
  plannedRepo: IPlannedTaskRepository,
  planned: PlannedTask,
  event: CalendarEvent
): Promise<void> {
  const action = openUrlAction(event.conferenceLink);
  if (!action) return;
  if (planned.actions.some((a) => a.type === action.type && a.value === action.value)) return;
  await plannedRepo.update({ ...planned, actions: [...planned.actions, action] });
}

/**
 * Alinha as reuniões já rastreadas de hoje com o estado atual da agenda:
 * - Evento sumiu de hoje (cancelado ou movido para outro dia): remove o
 *   rastreamento se ainda não foi iniciado como tarefa. Já iniciado permanece —
 *   o prompt de fim cuida do encerramento. (Movido para outro dia é re-inserido
 *   pelo sync daquele dia via upsert, pois deixa de constar em listForDate hoje.)
 * - Evento remarcado no mesmo dia (horário/término mudou): atualiza os horários.
 *   Se ainda não iniciado, reabre o prompt no horário novo (zera startPromptedAt
 *   e startDismissed — a remarcação é tratada como uma reunião nova).
 * - Sem mudança: não faz nada, para não re-perguntar a cada ciclo de sync.
 *
 * Devolve as reuniões que continuam valendo, **com os campos já atualizados** —
 * quem for gravar em cima delas depois precisa do estado novo, não do lido do
 * banco antes desta passagem.
 */
async function reconcileTracked(
  trackedRepo: ITrackedMeetingRepository,
  existing: TrackedMeeting[],
  timedById: Map<string, CalendarEvent>
): Promise<TrackedMeeting[]> {
  const surviving: TrackedMeeting[] = [];

  for (const m of existing) {
    const event = timedById.get(m.calendarEventId);

    if (!event) {
      if (m.startedTaskId) surviving.push(m);
      else await trackedRepo.remove(m.calendarEventId);
      continue;
    }

    const startISO = composeLocalISO(event.date, event.startTime!);
    const endISO = event.endTime
      ? composeMeetingEndISO(event.date, event.startTime!, event.endTime)
      : null;
    const moved = startISO !== m.startISO || endISO !== m.endISO;
    if (!moved && event.title === m.title) {
      surviving.push(m);
      continue;
    }

    const updated: TrackedMeeting = {
      ...m,
      title: event.title,
      startISO,
      endISO,
      // Reunião já em andamento: só acompanha o novo horário; não reabre início.
      startPromptedAt: !m.startedTaskId && moved ? null : m.startPromptedAt,
      startDismissed: !m.startedTaskId && moved ? false : m.startDismissed,
    };
    await trackedRepo.upsert(updated);
    surviving.push(updated);
  }

  return surviving;
}
