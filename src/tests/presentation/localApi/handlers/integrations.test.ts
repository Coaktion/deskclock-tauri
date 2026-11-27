import { describe, it, expect, vi } from "vitest";
import type { Task } from "@domain/entities/Task";
import type { TaskSendOutcome } from "@domain/integrations/ITaskSender";
import { validateTaskForClockify } from "@domain/integrations/taskValidation";
import type { TaskSendAdapter } from "@presentation/integrations/taskSendAdapters";
import { dispatchLocalApiRequest } from "@presentation/localApi/dispatch";
import { makeDeps, makeTask, WS_ATIVO } from "../fakeDeps";
import { localISO } from "../../../helpers/localTime";

function done(overrides: Partial<Task>): Task {
  return makeTask({
    status: "completed",
    projectId: "proj-ativo",
    endTime: localISO(2026, 9, 15, 10),
    durationSeconds: 600,
    ...overrides,
  });
}

// Dois registros do mesmo grupo e um avulso, no mesmo dia.
const TASKS = [
  done({ id: "a1", name: "Daily" }),
  done({ id: "a2", name: "Daily", durationSeconds: 300 }),
  done({ id: "b1", name: "Revisão" }),
];

function setup(
  options: {
    tasks?: Task[];
    sentIds?: string[];
    outcome?: Partial<TaskSendOutcome>;
    adapter?: Partial<TaskSendAdapter>;
  } = {}
) {
  const deps = makeDeps();
  const tasks = options.tasks ?? TASKS;
  deps.taskRepo.findByDateRange.mockResolvedValue(tasks);
  deps.taskRepo.findById.mockImplementation(async (id) => tasks.find((t) => t.id === id) ?? null);
  deps.taskLogRepo.findSentIds.mockResolvedValue(options.sentIds ?? []);
  const sender = {
    integrationName: "Clockify",
    send: vi.fn(async (payload: Task[]) => ({
      sentTaskIds: payload.map((t) => t.id),
      refused: [],
      failed: [],
      ...options.outcome,
    })),
  };
  const adapter: TaskSendAdapter = {
    integrationId: "clockify",
    workspaceId: WS_ATIVO,
    title: "Enviar para Clockify",
    sender,
    validateTask: validateTaskForClockify,
    onSendSuccess: vi.fn(async () => {}),
    notConfiguredMessage: "Clockify não configurado. Verifique API Key e workspace.",
    resendWarning: "aviso de reenvio",
    ...options.adapter,
  };
  deps.taskSend.adapterFor.mockReturnValue(adapter);
  return { deps, adapter, sender };
}

describe("integrations.sendPreview", () => {
  it("devolve os grupos do dia com estado, nomes e o workspace da integração", async () => {
    const { deps } = setup({
      tasks: [...TASKS, done({ id: "c1", name: "Sem projeto", projectId: null })],
      sentIds: ["b1"],
    });

    const res = await dispatchLocalApiRequest(deps, "integrations.sendPreview", {
      id: "clockify",
      from: "2026-09-15",
    });

    expect(res.status).toBe(200);
    expect(deps.taskSend.workspaceIdFor).toHaveBeenCalledWith("clockify");
    expect(deps.taskRepo.findByDateRange).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      WS_ATIVO
    );
    const body = res.body as {
      days: { date: string; totalSeconds: number; groups: Record<string, unknown>[] }[];
      sendWarning: string | null;
      resendWarning: string;
    };
    expect(body.days).toHaveLength(1);
    expect(body.days[0].date).toBe("2026-09-15");
    expect(body.days[0].totalSeconds).toBe(2100);
    const [daily, revisao, semProjeto] = body.days[0].groups;
    expect(daily).toMatchObject({
      name: "Daily",
      projectName: "Cliente",
      totalSeconds: 900,
      taskIds: ["a1", "a2"],
      state: "pending",
    });
    expect(revisao).toMatchObject({ state: "sent", sentTaskIds: ["b1"] });
    expect(semProjeto).toMatchObject({ state: "invalid", missing: ["projeto"] });
    expect(body.sendWarning).toBeNull();
    expect(body.resendWarning).toBe("aviso de reenvio");
  });

  it("traz o aviso do validateBeforeSend sobre os pendentes", async () => {
    const validateBeforeSend = vi.fn(() => "Projeto(s) sem board mapeado no Monday: Cliente.");
    const { deps } = setup({ adapter: { validateBeforeSend } });
    const res = await dispatchLocalApiRequest(deps, "integrations.sendPreview", { id: "clockify" });
    expect((res.body as { sendWarning: string }).sendWarning).toContain("sem board mapeado");
  });

  it("integração não configurada é 409 com a mensagem do modal", async () => {
    const { deps } = setup({ adapter: { sender: null } });
    const res = await dispatchLocalApiRequest(deps, "integrations.sendPreview", { id: "clockify" });
    expect(res).toEqual({
      status: 409,
      body: { error: "Clockify não configurado. Verifique API Key e workspace." },
    });
  });

  it("integração desconhecida é 404", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "integrations.sendPreview", { id: "jira" });
    expect(res.status).toBe(404);
  });

  it("data fora do formato é 400", async () => {
    const { deps } = setup();
    const res = await dispatchLocalApiRequest(deps, "integrations.sendPreview", {
      id: "clockify",
      from: "15/09",
    });
    expect(res.status).toBe(400);
  });
});

describe("integrations.send", () => {
  it("um id envia o grupo inteiro, marca e avisa as telas", async () => {
    const { deps, adapter, sender } = setup();

    const res = await dispatchLocalApiRequest(deps, "integrations.send", {
      id: "clockify",
      body: { taskIds: ["a2"] },
    });

    expect(res.status).toBe(200);
    // Representante com a duração do grupo, como o modal.
    expect(sender.send.mock.calls[0][0].map((t: Task) => [t.id, t.durationSeconds])).toEqual([
      ["a1", 900],
    ]);
    expect(deps.taskLogRepo.markSent).toHaveBeenCalledWith(["a1", "a2"], "clockify");
    expect(adapter.onSendSuccess).toHaveBeenCalled();
    expect(deps.notifyTasksChanged).toHaveBeenCalled();
    expect(res.body).toEqual({
      sentTaskIds: ["a1", "a2"],
      skippedTaskIds: [],
      refused: [],
      failed: [],
      sentGroups: 1,
      message: "1 grupo(s) enviado(s) com sucesso.",
    });
  });

  it("recusa: devolve o que subiu e não avança o timestamp", async () => {
    const { deps, adapter } = setup({
      outcome: { sentTaskIds: ["b1"], refused: ['"Daily": sem motivo.'] },
    });

    const res = await dispatchLocalApiRequest(deps, "integrations.send", {
      id: "clockify",
      body: { taskIds: ["a1", "b1"] },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ sentTaskIds: ["b1"], refused: ['"Daily": sem motivo.'] });
    expect(deps.taskLogRepo.markSent).toHaveBeenCalledWith(["b1"], "clockify");
    expect(adapter.onSendSuccess).not.toHaveBeenCalled();
  });

  it("reenvio do que já foi enviado é permitido", async () => {
    const { deps, sender } = setup({ sentIds: ["b1"] });
    const res = await dispatchLocalApiRequest(deps, "integrations.send", {
      id: "clockify",
      body: { taskIds: ["b1"] },
    });
    expect(res.status).toBe(200);
    expect(sender.send).toHaveBeenCalled();
  });

  it("validateBeforeSend barra com 409 sem enviar", async () => {
    const { deps, sender } = setup({ adapter: { validateBeforeSend: () => "Dados incompletos" } });
    const res = await dispatchLocalApiRequest(deps, "integrations.send", {
      id: "clockify",
      body: { taskIds: ["a1"] },
    });
    expect(res).toEqual({ status: 409, body: { error: "Dados incompletos" } });
    expect(sender.send).not.toHaveBeenCalled();
    expect(deps.taskLogRepo.markSent).not.toHaveBeenCalled();
  });

  it("grupo inválido é 409 sem enviar", async () => {
    const { deps, sender } = setup({ tasks: [done({ id: "x", projectId: null })] });
    const res = await dispatchLocalApiRequest(deps, "integrations.send", {
      id: "clockify",
      body: { taskIds: ["x"] },
    });
    expect(res.status).toBe(409);
    expect((res.body as { error: string }).error).toContain("faltando: projeto");
    expect(sender.send).not.toHaveBeenCalled();
  });

  it("não configurada é 409; ids vazios 400; inexistente 404; ativa ou de outro workspace 409", async () => {
    let { deps } = setup({ adapter: { sender: null } });
    expect(
      (
        await dispatchLocalApiRequest(deps, "integrations.send", {
          id: "clockify",
          body: { taskIds: ["a1"] },
        })
      ).status
    ).toBe(409);

    ({ deps } = setup());
    const call = (taskIds: unknown) =>
      dispatchLocalApiRequest(deps, "integrations.send", { id: "clockify", body: { taskIds } });
    expect((await call([])).status).toBe(400);
    expect((await call("a1")).status).toBe(400);
    expect((await call(["nao-existe"])).status).toBe(404);

    ({ deps } = setup({
      tasks: [done({ id: "r", status: "running" }), done({ id: "o", workspaceId: "ws-outro" })],
    }));
    expect((await call(["r"])).status).toBe(409);
    expect((await call(["o"])).status).toBe(409);
    expect(deps.taskLogRepo.markSent).not.toHaveBeenCalled();
  });
});
