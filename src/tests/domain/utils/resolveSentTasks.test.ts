import { describe, it, expect } from "vitest";
import { resolveSentTasks } from "@domain/utils/resolveSentTasks";
import type { TaskGroup } from "@domain/utils/groupTasks";
import type { Task } from "@domain/entities/Task";
import { localISO } from "../../helpers/localTime";

function makeTask(id: string, billable = true): Task {
  return {
    id,
    workspaceId: "ws-1",
    name: "Tarefa",
    projectId: "p1",
    categoryId: "c1",
    billable,
    startTime: localISO(2026, 8, 6, 9),
    endTime: localISO(2026, 8, 6, 10),
    durationSeconds: 3600,
    status: "completed",
    createdAt: localISO(2026, 8, 6, 9),
    updatedAt: localISO(2026, 8, 6, 10),
    customValues: {},
  };
}

function makeGroup(key: string, tasks: Task[]): TaskGroup {
  return { key, tasks, totalSeconds: tasks.length * 3600 };
}

describe("resolveSentTasks", () => {
  describe("representante por grupo (Sheets, Clockify)", () => {
    it("confirmado o representante, o grupo inteiro subiu", () => {
      // O sender recebeu uma tarefa sintética com a duração somada: o registro
      // no destino representa o grupo todo.
      const groups = [
        makeGroup("g1", [makeTask("a1"), makeTask("a2")]),
        makeGroup("g2", [makeTask("b1")]),
      ];

      expect(resolveSentTasks(groups, ["a1"], false)).toEqual({
        taskIds: ["a1", "a2"],
        fullySentGroups: 1,
      });
    });

    it("representante ausente deixa o grupo inteiro de fora", () => {
      const groups = [makeGroup("g1", [makeTask("a1"), makeTask("a2")])];
      expect(resolveSentTasks(groups, [], false)).toEqual({ taskIds: [], fullySentGroups: 0 });
    });
  });

  describe("tarefas cruas (Monday)", () => {
    it("grupo inteiro confirmado conta como enviado", () => {
      const groups = [makeGroup("g1", [makeTask("a1"), makeTask("a2")])];
      expect(resolveSentTasks(groups, ["a1", "a2"], true)).toEqual({
        taskIds: ["a1", "a2"],
        fullySentGroups: 1,
      });
    });

    it("grupo com billable misto marca só a metade confirmada", () => {
      // O agrupamento da tela (§6.3) não inclui `billable`, mas o do Monday
      // inclui: este grupo único vira dois itens no board. Recusado o não
      // faturável por falta de motivo, marcar o grupo daria o badge "Enviado" a
      // horas que nunca chegaram lá — e o badge é o que impede o reenvio.
      const groups = [makeGroup("g1", [makeTask("fat", true), makeTask("nao-fat", false)])];

      expect(resolveSentTasks(groups, ["fat"], true)).toEqual({
        taskIds: ["fat"],
        fullySentGroups: 0,
      });
    });

    it("id que não pertence a grupo nenhum é ignorado", () => {
      // O sender do Monday recebe o dia inteiro do projeto no envio por tarefa,
      // então pode confirmar tarefa que não está na seleção desta tela.
      const groups = [makeGroup("g1", [makeTask("a1")])];
      expect(resolveSentTasks(groups, ["a1", "de-outro-grupo"], true)).toEqual({
        taskIds: ["a1"],
        fullySentGroups: 1,
      });
    });
  });
});
