import { describe, it, expect, vi, beforeEach } from "vitest";
import { MondayTaskSender } from "@infra/integrations/MondayTaskSender";
import {
  MondayNotFoundError,
  MondayValidationError,
  MondayNetworkError,
} from "@infra/integrations/monday/errors";
import type { Task } from "@domain/entities/Task";
import type { CustomField } from "@domain/entities/CustomField";
import type { Category } from "@domain/entities/Category";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IMondayApi } from "@domain/integrations/IMondayApi";
import type { IMondayConfigPort } from "@domain/integrations/IMondayConfigPort";
import type { ICustomFieldRepository } from "@domain/repositories/ICustomFieldRepository";
import type {
  IMondayActivityItemRepository,
  MondayActivityItemRecord,
} from "@domain/repositories/IMondayActivityItemRepository";
import type { AppConfig } from "@shared/types/appConfig";
import type { MondayActivityColumnIds, MondayProjectMapping } from "@shared/types/mondayConfig";

const WORKSPACE_ID = "15505674";
const BOARD_ID = "9001";
const GROUP_ID = "group_mm2e2g9j";
const USER_ID = "21181483";

/** Rótulos da coluna Activity Type do board; a categoria casa com eles pelo nome. */
const ACTIVITY_TYPE_LABELS = ["Development", "Meeting"];

const STAGE_FIELD_ID = "field-stage";
const STAGE_OPTION_ID = "opt-execucao";

/** Campo personalizado que alimenta o Project Stage — semeado a partir do board. */
const STAGE_FIELD: CustomField = {
  id: STAGE_FIELD_ID,
  label: "Project Stage",
  type: "select",
  options: [
    { id: STAGE_OPTION_ID, label: "Execução" },
    { id: "opt-discovery", label: "Discovery" },
  ],
  sortOrder: 0,
  archived: false,
  createdAt: "2026-07-30T12:00:00.000Z",
};

const COLUMN_IDS: MondayActivityColumnIds = {
  reportedHours: "numeric_mm33gj5m",
  billingType: "color_mm33rxm7",
  activityType: "color_mm19csp3",
  projectStage: "color_mm19zrwg",
  status: "status",
  person: "person",
};

/** Só os boards com as colunas de data recebem Start/End Date. */
const DATE_COLUMN_IDS = { startDate: "date_mm33tthy", endDate: "date_mm33zcmr" };

const MAPPING: MondayProjectMapping = {
  deskclockProjectId: "proj-1",
  mondayBoardId: BOARD_ID,
  mondayBoardName: "[BR] Cliente Produto 01-999",
  activitiesGroupId: GROUP_ID,
  activityTypeLabels: ACTIVITY_TYPE_LABELS,
  projectStageLabels: ["Execução", "Discovery"],
  projectStageTitle: "Project Stage",
  columnIds: COLUMN_IDS,
  workspaceId: WORKSPACE_ID,
};

function makeConfig(overrides: Partial<AppConfig> = {}): IMondayConfigPort {
  const values: Partial<AppConfig> = {
    mondayApiKey: "token",
    mondayUserId: USER_ID,
    mondayActiveWorkspaceId: WORKSPACE_ID,
    mondayProjectMapping: [MAPPING],
    mondayProjectStageFieldId: STAGE_FIELD_ID,
    ...overrides,
  };
  return {
    get: vi.fn((key: keyof AppConfig) => values[key]) as IMondayConfigPort["get"],
    set: vi.fn(async () => {}),
  };
}

function makeClient(): IMondayApi {
  let created = 0;
  return {
    getMe: vi.fn(),
    listWorkspaces: vi.fn(),
    listFolders: vi.fn(),
    listBoards: vi.fn(),
    getBoardSchema: vi.fn(),
    listBoardSchemas: vi.fn(async () => []),
    listItems: vi.fn(async () => []),
    createItem: vi.fn(async () => ({ id: `item-${++created}` })),
    changeColumnValues: vi.fn(async (_board: string, itemId: string) => ({ id: itemId })),
    deleteItem: vi.fn(async () => {}),
  };
}

/** Store em memória: sem estado real o teste não enxerga upsert nem reconciliação. */
function makeItemRepo(seed: MondayActivityItemRecord[] = []): IMondayActivityItemRepository {
  const rows = [...seed];
  return {
    findCandidates: vi.fn(async (boardId, dayISO, signature, taskIds) => {
      const wanted = new Set(taskIds);
      const exact = rows.filter((r) => r.boardId === boardId && r.signature === signature);
      const seen = new Set(exact.map((r) => r.itemId));
      const byTask = rows.filter(
        (r) =>
          !seen.has(r.itemId) &&
          r.boardId === boardId &&
          r.dayISO === dayISO &&
          r.taskIds.some((id) => wanted.has(id))
      );
      return [...exact, ...byTask];
    }),
    save: vi.fn(async (record) => {
      const index = rows.findIndex(
        (r) => r.boardId === record.boardId && r.itemId === record.itemId
      );
      if (index >= 0) rows[index] = record;
      else rows.push(record);
    }),
    deleteItem: vi.fn(async (boardId, itemId) => {
      const index = rows.findIndex((r) => r.boardId === boardId && r.itemId === itemId);
      if (index >= 0) rows.splice(index, 1);
    }),
  };
}

/** A categoria vira Activity Type pelo nome — não há tabela de mapeamento. */
function makeCategoryRepo(name = "Development"): ICategoryRepository {
  const rows: Category[] = [{ id: "cat-1", workspaceId: "ws-1", name, defaultBillable: true }];
  return {
    findAll: vi.fn(async () => rows),
    findByName: vi.fn(async (wanted: string) => rows.find((c) => c.name === wanted) ?? null),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    deleteMany: vi.fn(async () => {}),
  };
}

/** Só as definições: o valor gravado na tarefa é o id da opção, não o rótulo. */
function makeFieldRepo(fields: CustomField[] = [STAGE_FIELD]): ICustomFieldRepository {
  return {
    findAll: vi.fn(async () => fields),
    findById: vi.fn(async (id: string) => fields.find((f) => f.id === id) ?? null),
    findByLabel: vi.fn(async (label: string) => fields.find((f) => f.label === label) ?? null),
    save: vi.fn(async () => {}),
    update: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws-1",
    name: "Testes para extrair dados",
    projectId: "proj-1",
    categoryId: "cat-1",
    billable: true,
    startTime: "2026-07-30T12:00:00.000Z",
    endTime: "2026-07-30T13:50:00.000Z",
    durationSeconds: 6600,
    status: "completed",
    createdAt: "2026-07-30T12:00:00.000Z",
    updatedAt: "2026-07-30T13:50:00.000Z",
    customValues: { [STAGE_FIELD_ID]: STAGE_OPTION_ID },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MondayTaskSender", () => {
  describe("pré-condições", () => {
    it("falha sem workspace configurado", async () => {
      const sender = new MondayTaskSender(
        makeConfig({ mondayActiveWorkspaceId: "" }),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        makeClient()
      );
      await expect(sender.send([makeTask()])).rejects.toThrow(/workspace/i);
    });

    it("falha sem usuário do Monday identificado", async () => {
      const sender = new MondayTaskSender(
        makeConfig({ mondayUserId: "" }),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        makeClient()
      );
      await expect(sender.send([makeTask()])).rejects.toThrow(/Usuário do Monday/);
    });

    it("falha quando nenhuma tarefa concluída é válida", async () => {
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        makeClient()
      );
      await expect(sender.send([makeTask({ projectId: null })])).rejects.toThrow(/nome e projeto/);
    });

    it("ignora tarefas ainda em execução", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ status: "running", endTime: null })]);

      expect(client.createItem).not.toHaveBeenCalled();
    });

    it("falha quando nenhum projeto envolvido está mapeado para um board", async () => {
      const sender = new MondayTaskSender(
        makeConfig({ mondayProjectMapping: [] }),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        makeClient()
      );
      await expect(sender.send([makeTask()])).rejects.toThrow(/não estão mapeados/);
    });

    it("desconsidera mapeamentos de outro workspace", async () => {
      const config = makeConfig({
        mondayProjectMapping: [
          {
            deskclockProjectId: "proj-1",
            mondayBoardId: BOARD_ID,
            mondayBoardName: "Board",
            activitiesGroupId: GROUP_ID,
            activityTypeLabels: ACTIVITY_TYPE_LABELS,
            projectStageLabels: ["Execução", "Discovery"],
            projectStageTitle: "Project Stage",
            columnIds: COLUMN_IDS,
            workspaceId: "outro-ws",
          },
        ],
      });
      const sender = new MondayTaskSender(
        config,
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        makeClient()
      );
      await expect(sender.send([makeTask()])).rejects.toThrow(/não estão mapeados/);
    });
  });

  describe("unificação interna", () => {
    it("soma tarefas do mesmo grupo no mesmo dia num único item", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "a", durationSeconds: 3600 }),
        makeTask({ id: "b", durationSeconds: 1800 }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(vi.mocked(client.createItem).mock.calls[0][3]).toMatchObject({
        [COLUMN_IDS.reportedHours]: "1.5",
      });
      expect(vi.mocked(itemRepo.save).mock.calls[0][0].taskIds).toEqual(["a", "b"]);
    });

    it("separa dias distintos em itens distintos", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "a", startTime: "2026-07-30T12:00:00.000Z" }),
        makeTask({ id: "b", startTime: "2026-07-31T12:00:00.000Z" }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(2);
    });

    it("separa grupos distintos no mesmo dia", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "a" }),
        makeTask({ id: "b", workspaceId: "ws-1", name: "Outra tarefa" }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(2);
    });
  });

  describe("upsert idempotente", () => {
    it("cria o item quando o grupo é novo e registra o rastreamento", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask()]);

      expect(client.createItem).toHaveBeenCalledWith(
        BOARD_ID,
        GROUP_ID,
        "Testes para extrair dados",
        {
          [COLUMN_IDS.reportedHours]: "1.83",
          [COLUMN_IDS.billingType]: { label: "Billable" },
          [COLUMN_IDS.activityType]: { label: "Development" },
          [COLUMN_IDS.projectStage!]: { label: "Execução" },
          [COLUMN_IDS.status]: { label: "Completed" },
          [COLUMN_IDS.person]: { personsAndTeams: [{ id: 21181483, kind: "person" }] },
        }
      );
      expect(client.changeColumnValues).not.toHaveBeenCalled();
      expect(vi.mocked(itemRepo.save).mock.calls[0][0]).toMatchObject({
        boardId: BOARD_ID,
        itemId: "item-1",
        dayISO: "2026-07-30",
        taskIds: ["t1"],
      });
    });

    it("atualiza o item existente quando a duração do grupo mudou", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ durationSeconds: 3600 })]);
      vi.mocked(client.createItem).mockClear();
      await sender.send([makeTask({ durationSeconds: 6600 })]);

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ [COLUMN_IDS.reportedHours]: "1.83" })
      );
    });

    it("atualiza o item quando só o billable mudou", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ billable: true })]);
      await sender.send([makeTask({ billable: false })]);

      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ [COLUMN_IDS.billingType]: { label: "Non Billable" } })
      );
    });

    it("atualiza o item quando a categoria da tarefa foi renomeada", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      await new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      ).send([makeTask()]);

      await new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo("Meeting"),
        client
      ).send([makeTask()]);

      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ [COLUMN_IDS.activityType]: { label: "Meeting" } })
      );
    });

    it("não chama a API quando nada mudou desde o último envio", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask()]);
      vi.mocked(client.createItem).mockClear();
      await sender.send([makeTask()]);

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).not.toHaveBeenCalled();
    });

    it("renomear a tarefa atualiza o mesmo item em vez de criar outro", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ id: "t1", workspaceId: "ws-1", name: "Nome antigo" })]);
      vi.mocked(client.createItem).mockClear();
      await sender.send([makeTask({ id: "t1", workspaceId: "ws-1", name: "Nome novo" })]);

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ name: "Nome novo" })
      );
      expect(vi.mocked(itemRepo.save).mock.calls[1][0].signature).toContain("Nome novo");
    });

    it("trocar a categoria atualiza o mesmo item", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ categoryId: "cat-1" })]);
      vi.mocked(client.createItem).mockClear();
      await sender.send([makeTask({ categoryId: "cat-2" })]);

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).toHaveBeenCalled();
    });

    it("recria o item quando ele foi apagado no Monday", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ durationSeconds: 3600 })]);
      vi.mocked(client.changeColumnValues).mockRejectedValueOnce(
        new MondayNotFoundError("Item not found")
      );
      await sender.send([makeTask({ durationSeconds: 6600 })]);

      expect(client.createItem).toHaveBeenCalledTimes(2);
      expect(itemRepo.deleteItem).toHaveBeenCalledWith(BOARD_ID, "item-1");
      expect(vi.mocked(itemRepo.save).mock.calls[1][0].itemId).toBe("item-2");
    });

    it("não recria quando o erro do update não é 'não encontrado'", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ durationSeconds: 3600 })]);
      vi.mocked(client.changeColumnValues).mockRejectedValueOnce(
        new MondayValidationError("Label not found in Activity Type")
      );

      await expect(sender.send([makeTask({ durationSeconds: 6600 })])).rejects.toBeInstanceOf(
        MondayValidationError
      );
      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(itemRepo.deleteItem).not.toHaveBeenCalled();
    });

    it("fundir dois grupos apaga o item perdedor em vez de deixá-lo com horas órfãs", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 3600 }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa B", durationSeconds: 1800 }),
      ]);
      expect(client.createItem).toHaveBeenCalledTimes(2);
      vi.mocked(client.createItem).mockClear();

      // o usuário corrige o nome de t2 para bater com t1: um grupo de 1,5h
      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 3600 }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 1800 }),
      ]);

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ [COLUMN_IDS.reportedHours]: "1.5" })
      );
      expect(client.deleteItem).toHaveBeenCalledWith("item-2");
      expect(itemRepo.deleteItem).toHaveBeenCalledWith(BOARD_ID, "item-2");
    });

    it("não apaga item cujo grupo tem tarefa fora do envio", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      // item-1 = grupo "Tarefa A" com t1; item-2 = grupo "Tarefa X" com t2 e t9
      await sender.send([makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" })]);
      await sender.send([
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa X" }),
        makeTask({ id: "t9", workspaceId: "ws-1", name: "Tarefa X" }),
      ]);
      vi.mocked(client.createItem).mockClear();

      // o usuário renomeia t2 para "Tarefa A"; o envio por tarefa manda só esse grupo,
      // então t9 não está em escopo e item-2 ainda a representa
      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa A" }),
      ]);

      expect(client.deleteItem).not.toHaveBeenCalled();
      expect(itemRepo.deleteItem).not.toHaveBeenCalled();
    });

    it("item órfão já apagado no Monday só limpa o rastreamento", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa B" }),
      ]);
      vi.mocked(client.deleteItem).mockRejectedValueOnce(new MondayNotFoundError("Item not found"));

      await expect(
        sender.send([
          makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" }),
          makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa A" }),
        ])
      ).resolves.toBeUndefined();

      expect(itemRepo.deleteItem).toHaveBeenCalledWith(BOARD_ID, "item-2");
    });

    it("propaga erro que não seja 'não encontrado' ao apagar o órfão", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa B" }),
      ]);
      vi.mocked(client.deleteItem).mockRejectedValueOnce(
        new MondayValidationError("sem permissão")
      );

      await expect(
        sender.send([
          makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A" }),
          makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa A" }),
        ])
      ).rejects.toBeInstanceOf(MondayValidationError);
      expect(itemRepo.deleteItem).not.toHaveBeenCalled();
    });

    it("o match exato de assinatura vence a interseção, independente da ordem", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      // item-1 nasce com t1+t2 sob o nome "Tarefa B"
      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa B" }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa B" }),
      ]);
      vi.mocked(client.createItem).mockClear();
      vi.mocked(client.changeColumnValues).mockClear();

      // t1 vira "Tarefa A"; o grupo A (interseção) é processado antes do grupo B (exato)
      await sender.send([
        makeTask({
          id: "t1",
          workspaceId: "ws-1",
          name: "Tarefa A",
          startTime: "2026-07-30T09:00:00.000Z",
        }),
        makeTask({
          id: "t2",
          workspaceId: "ws-1",
          name: "Tarefa B",
          startTime: "2026-07-30T17:00:00.000Z",
        }),
      ]);

      // item-1 fica com quem o tem por assinatura exata; o outro grupo ganha item novo
      expect(client.changeColumnValues).toHaveBeenCalledWith(
        BOARD_ID,
        "item-1",
        expect.objectContaining({ name: "Tarefa B" })
      );
      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(vi.mocked(client.createItem).mock.calls[0][2]).toBe("Tarefa A");
    });

    it("dividir um grupo não faz dois grupos disputarem o mesmo item", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 3600 }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 1800 }),
      ]);
      expect(client.createItem).toHaveBeenCalledTimes(1);
      vi.mocked(client.createItem).mockClear();

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", name: "Tarefa A", durationSeconds: 3600 }),
        makeTask({ id: "t2", workspaceId: "ws-1", name: "Tarefa B", durationSeconds: 1800 }),
      ]);

      // um grupo herda o item existente, o outro ganha um item novo — nenhum órfão
      expect(client.createItem).toHaveBeenCalledTimes(1);
      expect(client.deleteItem).not.toHaveBeenCalled();
    });

    it("separa billable de non-billable em itens distintos", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ id: "t1", workspaceId: "ws-1", billable: true, durationSeconds: 3600 }),
        makeTask({ id: "t2", workspaceId: "ws-1", billable: false, durationSeconds: 1800 }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(2);
      const labels = vi
        .mocked(client.createItem)
        .mock.calls.map((c) => (c[3] as Record<string, { label: string }>)[COLUMN_IDS.billingType]);
      expect(labels).toEqual(
        expect.arrayContaining([{ label: "Billable" }, { label: "Non Billable" }])
      );
    });

    it("o Billing type não depende da ordem em que as tarefas chegam", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );
      const billableTask = makeTask({
        id: "t1",
        workspaceId: "ws-1",
        billable: true,
        startTime: "2026-07-30T12:00:00.000Z",
      });
      const otherTask = makeTask({
        id: "t2",
        workspaceId: "ws-1",
        billable: false,
        startTime: "2026-07-30T14:00:00.000Z",
      });

      await sender.send([billableTask, otherTask]);
      const first = vi.mocked(client.createItem).mock.calls.map((c) => c[3]);
      vi.mocked(client.createItem).mockClear();

      const sender2 = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );
      await sender2.send([otherTask, billableTask]);
      const second = vi.mocked(client.createItem).mock.calls.map((c) => c[3]);

      expect(second).toEqual(expect.arrayContaining(first));
    });

    it("propaga erro de rede na atualização em vez de recriar", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const sender = new MondayTaskSender(
        makeConfig(),
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ durationSeconds: 3600 })]);
      vi.mocked(client.changeColumnValues).mockRejectedValueOnce(new MondayNetworkError());

      await expect(sender.send([makeTask({ durationSeconds: 6600 })])).rejects.toBeInstanceOf(
        MondayNetworkError
      );
      expect(itemRepo.deleteItem).not.toHaveBeenCalled();
    });
  });

  describe("mapeamento de colunas", () => {
    it("grava Non Billable quando a tarefa não é faturável", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ billable: false })]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).toMatchObject({
        [COLUMN_IDS.billingType]: { label: "Non Billable" },
      });
    });

    it("não quebra com mapeamento gravado antes do cache de rótulos", async () => {
      const client = makeClient();
      const legacy = makeConfig({
        mondayProjectMapping: [
          {
            deskclockProjectId: "proj-1",
            mondayBoardId: BOARD_ID,
            mondayBoardName: "[BR] Cliente Produto 01-999",
            activitiesGroupId: GROUP_ID,
            columnIds: COLUMN_IDS,
            workspaceId: WORKSPACE_ID,
          } as MondayProjectMapping,
        ],
      });
      const sender = new MondayTaskSender(
        legacy,
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask()]);

      // Sem rótulos conhecidos a coluna fica de fora: mandar um rótulo que o
      // board não tem faria o Monday recusar a escrita inteira.
      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.activityType
      );
    });

    it("grava Start Date e End Date na criação e não as repete no update", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const config = makeConfig({
        mondayProjectMapping: [{ ...MAPPING, columnIds: { ...COLUMN_IDS, ...DATE_COLUMN_IDS } }],
      });

      await new MondayTaskSender(
        config,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      ).send([makeTask()]);

      const created = vi.mocked(client.createItem).mock.calls[0][3];
      expect(created[DATE_COLUMN_IDS.startDate]).toEqual(created[DATE_COLUMN_IDS.endDate]);
      expect(created[DATE_COLUMN_IDS.startDate]).toMatchObject({
        date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        time: expect.stringMatching(/^\d{2}:\d{2}:\d{2}$/),
      });

      await new MondayTaskSender(
        config,
        itemRepo,
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      ).send([makeTask({ durationSeconds: 7200 })]);

      // As datas marcam o nascimento do item: no update elas mudariam a cada
      // execução e nenhum grupo cairia mais no skip por payload igual.
      const updated = vi.mocked(client.changeColumnValues).mock.calls[0][2];
      expect(updated).not.toHaveProperty(DATE_COLUMN_IDS.startDate);
      expect(updated).not.toHaveProperty(DATE_COLUMN_IDS.endDate);
    });

    it("segue pulando a API quando nada mudou, apesar das datas", async () => {
      const client = makeClient();
      const itemRepo = makeItemRepo();
      const config = makeConfig({
        mondayProjectMapping: [{ ...MAPPING, columnIds: { ...COLUMN_IDS, ...DATE_COLUMN_IDS } }],
      });
      const send = () =>
        new MondayTaskSender(config, itemRepo, makeFieldRepo(), makeCategoryRepo(), client).send([
          makeTask(),
        ]);

      await send();
      vi.mocked(client.createItem).mockClear();
      await send();

      expect(client.createItem).not.toHaveBeenCalled();
      expect(client.changeColumnValues).not.toHaveBeenCalled();
    });

    it("grava o nome da categoria como Activity Type", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo("Meeting"),
        client
      );

      await sender.send([makeTask()]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).toMatchObject({
        [COLUMN_IDS.activityType]: { label: "Meeting" },
      });
    });

    it("omite Activity Type quando o nome da categoria não é rótulo do board", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo("Categoria só do DeskClock"),
        client
      );

      await sender.send([makeTask()]);

      const columnValues = vi.mocked(client.createItem).mock.calls[0][3];
      expect(columnValues).not.toHaveProperty(COLUMN_IDS.activityType);
    });

    it("grava no Project Stage o rótulo da opção escolhida na tarefa", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ customValues: { [STAGE_FIELD_ID]: "opt-discovery" } })]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).toMatchObject({
        [COLUMN_IDS.projectStage!]: { label: "Discovery" },
      });
    });

    it("omite Project Stage quando o rótulo não existe na coluna do board", async () => {
      const client = makeClient();
      // O campo personalizado é editável na tela de Dados: a opção pode não vir
      // do board, e um rótulo inexistente derruba a escrita inteira.
      const fieldRepo = makeFieldRepo([
        {
          ...STAGE_FIELD,
          options: [{ id: "opt-inventada", label: "Etapa que só existe no DeskClock" }],
        },
      ]);
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        fieldRepo,
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ customValues: { [STAGE_FIELD_ID]: "opt-inventada" } })]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.projectStage!
      );
    });

    it("omite Activity Type quando a tarefa não tem categoria", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ categoryId: null })]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.activityType
      );
    });

    it("omite Project Stage quando a tarefa não preencheu o campo", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask({ customValues: {} })]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.projectStage!
      );
    });

    it("omite Project Stage quando nenhum campo personalizado está vinculado", async () => {
      const client = makeClient();
      const fieldRepo = makeFieldRepo();
      const sender = new MondayTaskSender(
        makeConfig({ mondayProjectStageFieldId: "" }),
        makeItemRepo(),
        fieldRepo,
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask()]);

      expect(fieldRepo.findById).not.toHaveBeenCalled();
      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.projectStage!
      );
    });

    it("omite Project Stage quando o campo vinculado foi excluído", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo([]),
        makeCategoryRepo(),
        client
      );

      await sender.send([makeTask()]);

      expect(vi.mocked(client.createItem).mock.calls[0][3]).not.toHaveProperty(
        COLUMN_IDS.projectStage!
      );
    });

    it("cria itens distintos para tarefas iguais em etapas diferentes", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask({ customValues: { [STAGE_FIELD_ID]: STAGE_OPTION_ID } }),
        makeTask({ id: "t2", customValues: { [STAGE_FIELD_ID]: "opt-discovery" } }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(2);
      const stages = vi
        .mocked(client.createItem)
        .mock.calls.map((call) => call[3][COLUMN_IDS.projectStage!]);
      expect(stages).toEqual([{ label: "Execução" }, { label: "Discovery" }]);
    });

    it("envia as tarefas mapeadas mesmo quando outras não têm board", async () => {
      const client = makeClient();
      const sender = new MondayTaskSender(
        makeConfig(),
        makeItemRepo(),
        makeFieldRepo(),
        makeCategoryRepo(),
        client
      );

      await sender.send([
        makeTask(),
        makeTask({ id: "t2", workspaceId: "ws-1", projectId: "proj-sem-board" }),
      ]);

      expect(client.createItem).toHaveBeenCalledTimes(1);
    });
  });
});
