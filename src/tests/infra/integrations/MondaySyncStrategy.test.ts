import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { Task } from "@domain/entities/Task";
import type { AppConfig } from "@shared/types/appConfig";
import type { IMondayConfigPort } from "@domain/integrations/IMondayConfigPort";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";
import type { IMondayActivityItemRepository } from "@domain/repositories/IMondayActivityItemRepository";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { MondayDailySyncDeps } from "@infra/integrations/runMondayDailySync";
import type { TaskSendOutcome } from "@domain/integrations/ITaskSender";

/** Aceita tudo: devolve como enviado exatamente o que recebeu. */
const sendMock = vi.fn(async (tasks: Task[]): Promise<TaskSendOutcome> => ({
  sentTaskIds: tasks.map((t) => t.id),
  refused: [],
  failed: [],
}));
vi.mock("@infra/integrations/MondayTaskSender", () => ({
  MondayTaskSender: class {
    readonly integrationName = "Monday";
    send = sendMock;
  },
}));

const dailyMock = vi.fn(async (_deps: MondayDailySyncDeps, _endDateISO: string) => ({
  integration: "Monday",
  count: 0,
}));
vi.mock("@infra/integrations/runMondayDailySync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@infra/integrations/runMondayDailySync")>()),
  runMondayDailySync: dailyMock,
}));

const { MondaySyncStrategy } = await import("@infra/integrations/MondaySyncStrategy");

function makeConfig(overrides: Partial<AppConfig> = {}): IMondayConfigPort {
  const values: Partial<AppConfig> = {
    mondayAutoSync: true,
    mondayAutoSyncMode: "per-task",
    mondayApiKey: "token",
    mondayPortfolioBoardId: "ws1",
    mondayDailySyncLastTimestamp: "",
    // O workspace do DeskClock em que a integração trabalha — o mesmo de
    // `makeTask`, para que os casos que não tratam de workspace não caiam no
    // recorte e sim naquilo que se propõem a verificar.
    mondayDeskclockWorkspaceId: "ws-1",
    mondayProjectMapping: [
      {
        deskclockProjectId: "proj-1",
        portfolioItemId: "item-proj-1",
        scope: "cliente" as const,
        mondayBoardId: "b1",
        mondayBoardName: "Board",
        activitiesGroupId: "g1",
        activityTypeLabels: ["Development"],
        projectStageLabels: [],
        projectStageTitle: "",
        nonBillableReasonLabels: [],
        reportTypeGroupIds: { Activity: "g1" },
        columnIds: {
          reportedHours: "num",
          billingType: "billing",
          activityType: "activity",
          status: "status",
          person: "person",
        },
      },
    ],
    ...overrides,
  };
  return {
    get: vi.fn((key: keyof AppConfig) => values[key]) as IMondayConfigPort["get"],
    set: vi.fn(async () => {}),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Daily",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-07-30T12:00:00.000Z",
    endTime: "2026-07-30T12:15:00.000Z",
    durationSeconds: 900,
    status: "completed",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T12:15:00.000Z",
    customValues: {},
    ...overrides,
  };
}

/** A strategy só repassa os repositórios ao sender, que aqui está mockado. */
function makeCategoryRepo(): ICategoryRepository {
  return {
    findAll: vi.fn(async () => []),
    findByName: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deleteMany: vi.fn(async () => {}),
  };
}

function makeFieldRepo(): ICustomFieldRepository {
  return {
    findAll: vi.fn(async () => []),
    findById: vi.fn(async () => null),
    findByLabel: vi.fn(async () => null),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

function makeDeps(sameDayTasks: Task[] = []) {
  const taskRepo = {
    findByDateRange: vi.fn(async () => sameDayTasks),
  } as unknown as ITaskRepository;
  const logRepo = {
    markSent: vi.fn(async () => {}),
    findSentIds: vi.fn(async () => []),
  } as unknown as ITaskIntegrationLogRepository;
  const itemRepo: IMondayActivityItemRepository = {
    findCandidates: vi.fn(async () => []),
    save: vi.fn(async () => {}),
    deleteItem: vi.fn(async () => {}),
  };
  return { taskRepo, logRepo, itemRepo };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MondaySyncStrategy", () => {
  describe("habilitação", () => {
    it("per-task só habilita com auto-sync, modo, token e workspace", () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      expect(strategy.isPerTaskEnabled()).toBe(true);
      expect(strategy.isDailyEnabled()).toBe(false);
    });

    it("não habilita sem token", () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayApiKey: "" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );
      expect(strategy.isPerTaskEnabled()).toBe(false);
    });

    it("não habilita sem workspace", () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayPortfolioBoardId: "" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );
      expect(strategy.isPerTaskEnabled()).toBe(false);
    });

    it("daily habilita quando o modo é daily", () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayAutoSyncMode: "daily" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );
      expect(strategy.isDailyEnabled()).toBe(true);
      expect(strategy.isPerTaskEnabled()).toBe(false);
    });
  });

  describe("runPerTask", () => {
    it("envia o dia inteiro do projeto, para o sender unificar e reconciliar", async () => {
      const task = makeTask({ id: "t1", durationSeconds: 900 });
      const { taskRepo, logRepo, itemRepo } = makeDeps([
        task,
        makeTask({ id: "t2", durationSeconds: 1800 }),
        makeTask({ id: "t3", workspaceId: "ws-1", name: "Outra tarefa", durationSeconds: 3600 }),
      ]);
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(task);

      expect(result).toMatchObject({ integration: "Monday", count: 1 });
      // t3 é de outro grupo, mas do mesmo projeto: precisa entrar para que o item
      // que a contém seja reconciliado caso alguma tarefa tenha trocado de grupo
      expect(sendMock.mock.calls[0][0].map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    });

    it("tarefa recusada pelo sender não é marcada como enviada", async () => {
      // Com a recusa fora do canal de exceção, "não lançou" deixou de significar
      // "subiu": sem esta guarda a hora que o board recusou ganhava o badge
      // "Enviado" e nunca mais seria reenviada.
      const task = makeTask({ id: "t1" });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      sendMock.mockResolvedValueOnce({
        sentTaskIds: [],
        refused: ['"Tarefa": informe o motivo de não faturável.'],
        failed: [],
      });

      const result = await new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      ).runPerTask(task);

      expect(result.count).toBe(0);
      expect(result.warning).toContain("informe o motivo");
      expect(logRepo.markSent).not.toHaveBeenCalled();
    });

    it("recusa de outro grupo do dia vira aviso, sem tirar o mérito do que subiu", async () => {
      // O escopo enviado é o dia inteiro do projeto: esta tarefa pode subir
      // enquanto outro grupo é recusado. Descartar o `refused` calaria o aviso.
      const task = makeTask({ id: "t1" });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task, makeTask({ id: "t2" })]);
      sendMock.mockResolvedValueOnce({
        sentTaskIds: ["t1"],
        refused: ['"Outra": sem grupo para o Report Type.'],
        failed: [],
      });

      const result = await new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      ).runPerTask(task);

      expect(result.count).toBe(1);
      expect(logRepo.markSent).toHaveBeenCalledWith(["t1"], "monday");
      expect(result.warning).toContain("sem grupo para o Report Type");
    });

    it("falha técnica no envio por tarefa vira error, não warning", async () => {
      // É a distinção que se perdeu ao tirar a recusa do canal de exceção:
      // antes, queda de rede lançava e virava toast vermelho.
      const task = makeTask({ id: "t1" });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      sendMock.mockResolvedValueOnce({
        sentTaskIds: [],
        refused: [],
        failed: ['"Daily": Failed to fetch.'],
      });

      const result = await new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      ).runPerTask(task);

      expect(result.error?.message).toContain("Failed to fetch");
      expect(result.warning).toBeUndefined();
      expect(logRepo.markSent).not.toHaveBeenCalled();
    });

    it("não arrasta tarefas de outros projetos para o envio", async () => {
      const task = makeTask({ id: "t1" });
      const { taskRepo, logRepo, itemRepo } = makeDeps([
        task,
        makeTask({ id: "outro-projeto", workspaceId: "ws-1", projectId: "proj-2" }),
      ]);
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runPerTask(task);

      expect(sendMock.mock.calls[0][0].map((t) => t.id)).toEqual(["t1"]);
    });

    it("não duplica a própria tarefa quando o repositório já a devolve", async () => {
      const task = makeTask({ id: "t1", durationSeconds: 900 });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runPerTask(task);

      expect(sendMock.mock.calls[0][0].map((t) => t.id)).toEqual(["t1"]);
    });

    it("ignora tarefas do dia ainda não concluídas", async () => {
      const task = makeTask({ id: "t1", durationSeconds: 900 });
      const { taskRepo, logRepo, itemRepo } = makeDeps([
        task,
        makeTask({ id: "t2", durationSeconds: 1800, status: "running" }),
      ]);
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runPerTask(task);

      expect(sendMock.mock.calls[0][0].map((t) => t.id)).toEqual(["t1"]);
    });

    it("avisa sem enviar quando o projeto não tem board mapeado", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayProjectMapping: [] }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(makeTask());

      expect(result.warning).toContain("não está mapeado");
      expect(result.count).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
      expect(logRepo.markSent).not.toHaveBeenCalled();
    });

    it("avisa sem enviar quando faltam dados na tarefa", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(makeTask({ projectId: null }));

      expect(result.warning).toContain("projeto");
      expect(result.count).toBe(0);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it("devolve o erro quando o envio falha", async () => {
      sendMock.mockRejectedValueOnce(new Error("Monday fora do ar"));
      const task = makeTask();
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(task);

      expect(result.error?.message).toBe("Monday fora do ar");
      expect(logRepo.markSent).not.toHaveBeenCalled();
    });

    it("não envia — nem avisa — tarefa de fora do workspace da integração", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayDeskclockWorkspaceId: "ws-trabalho" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(makeTask({ workspaceId: "ws-pessoal" }));

      expect(result.count).toBe(0);
      // Sem `warning` de propósito: a hora pessoal não é assunto do Monday, e
      // avisar a cada parada faria a integração reclamar do que ela não devia
      // sequer ter considerado.
      expect(result.warning).toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
      expect(logRepo.markSent).not.toHaveBeenCalled();
    });

    it("monta o grupo do dia só com o workspace da integração", async () => {
      const task = makeTask({ workspaceId: "ws-trabalho" });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayDeskclockWorkspaceId: "ws-trabalho" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runPerTask(task);

      expect(taskRepo.findByDateRange).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "ws-trabalho"
      );
    });

    it("sem workspace escolhido, trabalha no Padrão", async () => {
      const task = makeTask({ workspaceId: DEFAULT_WORKSPACE_ID });
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayDeskclockWorkspaceId: "" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      const result = await strategy.runPerTask(task);

      expect(result.count).toBe(1);
      expect(taskRepo.findByDateRange).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        DEFAULT_WORKSPACE_ID
      );
    });

    it("marca como enviada e atualiza o timestamp no sucesso", async () => {
      const task = makeTask();
      const { taskRepo, logRepo, itemRepo } = makeDeps([task]);
      const config = makeConfig();
      const strategy = new MondaySyncStrategy(
        config,
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runPerTask(task);

      expect(logRepo.markSent).toHaveBeenCalledWith(["t1"], "monday");
      expect(config.set).toHaveBeenCalledWith("mondayDailySyncLastTimestamp", expect.any(String));
    });
  });

  describe("runDaily", () => {
    it("delega ao runMondayDailySync com a chave de timestamp do Monday", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const config = makeConfig({
        mondayAutoSyncMode: "daily",
        mondayDailySyncLastTimestamp: "2026-07-29T00:00:00.000Z",
      });
      const strategy = new MondaySyncStrategy(
        config,
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runDaily("2026-07-30");

      const [deps, endDate] = dailyMock.mock.calls[0];
      expect(endDate).toBe("2026-07-30");
      expect(deps.integrationName).toBe("Monday");
      expect(deps.timestampPort.get()).toBe("2026-07-29T00:00:00.000Z");

      await deps.timestampPort.set("2026-07-30T18:00:00.000Z");
      expect(config.set).toHaveBeenCalledWith(
        "mondayDailySyncLastTimestamp",
        "2026-07-30T18:00:00.000Z"
      );
    });

    it("o validate exige nome, projeto E board mapeado", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig(),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runDaily("2026-07-30");
      const { validate } = dailyMock.mock.calls[0][0];

      expect(validate(makeTask())).toBe(true);
      expect(validate(makeTask({ name: null }))).toBe(false);
      expect(validate(makeTask({ projectId: "proj-sem-board" }))).toBe(false);
    });

    it("passa adiante o workspace da integração, para o envio não varrer todos", async () => {
      const { taskRepo, logRepo, itemRepo } = makeDeps();
      const strategy = new MondaySyncStrategy(
        makeConfig({ mondayDeskclockWorkspaceId: "ws-trabalho" }),
        taskRepo,
        logRepo,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo()
      );

      await strategy.runDaily("2026-07-30");

      expect(dailyMock.mock.calls[0][0].workspaceId).toBe("ws-trabalho");
    });
  });
});
