import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import {
  useOmniboxRunningEdit,
  type OmniboxFocus,
} from "@presentation/hooks/useOmniboxRunningEdit";
import { localISO } from "../../helpers/localTime";

const PROJECTS: Project[] = [
  { id: "p1", workspaceId: "ws1", name: "Cliente A", colorIndex: 0, createdAt: "" },
] as unknown as Project[];

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "ws1", name: "Desenvolvimento", defaultBillable: true, createdAt: "" },
] as unknown as Category[];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "ws1",
    name: "Ajustes no relatório mensal",
    projectId: "p1",
    categoryId: "c1",
    billable: true,
    startTime: localISO(2026, 1, 15, 9, 30),
    endTime: null,
    durationSeconds: null,
    status: "running",
    createdAt: localISO(2026, 1, 15, 9, 30),
    updatedAt: localISO(2026, 1, 15, 9, 30),
    customValues: {},
    ...overrides,
  };
}

interface Props {
  omniboxFocus: OmniboxFocus;
  task: Task | null;
  catalogsLoading?: boolean;
}

function setup(
  omniboxFocus: OmniboxFocus,
  task: Task | null = makeTask(),
  catalogsLoading = false
) {
  const onOmniboxFocusHandled = vi.fn();
  const actions = {
    updateActiveTask: vi.fn().mockResolvedValue(undefined),
    stopTask: vi.fn().mockResolvedValue(undefined),
    pauseTask: vi.fn().mockResolvedValue(undefined),
    resumeTask: vi.fn().mockResolvedValue(undefined),
  };
  const { result, rerender } = renderHook(
    (props: Props) =>
      useOmniboxRunningEdit({
        runningTask: props.task,
        projects: props.catalogsLoading ? [] : PROJECTS,
        categories: props.catalogsLoading ? [] : CATEGORIES,
        omniboxFocus: props.omniboxFocus,
        catalogsLoading: props.catalogsLoading,
        onOmniboxFocusHandled,
        ...actions,
      }),
    { initialProps: { omniboxFocus, task, catalogsLoading } as Props }
  );
  return { result, rerender, onOmniboxFocusHandled };
}

describe("useOmniboxRunningEdit — pedido de foco", () => {
  it("sem pedido, não abre nada nem avisa", () => {
    const { result, onOmniboxFocusHandled } = setup(null);

    expect(result.current.editingRunningChip).toBeNull();
    expect(result.current.confirmingStop).toBe(false);
    expect(onOmniboxFocusHandled).not.toHaveBeenCalled();
  });

  it("sem tarefa ativa, consome o pedido sem abrir nada", () => {
    const { result, onOmniboxFocusHandled } = setup("stop", null);

    expect(result.current.confirmingStop).toBe(false);
    expect(result.current.fillingRequired).toBe(false);
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("edit: abre o chip de projeto quando a tarefa não tem projeto", () => {
    const { result, onOmniboxFocusHandled } = setup("edit", makeTask({ projectId: null }));

    expect(result.current.editingRunningChip).toBe("project");
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("edit: abre o chip de categoria quando só a categoria falta", () => {
    const { result } = setup("edit", makeTask({ categoryId: null }));

    expect(result.current.editingRunningChip).toBe("category");
  });

  it("edit: com tudo preenchido, só avisa que tratou", () => {
    const { result, onOmniboxFocusHandled } = setup("edit");

    expect(result.current.editingRunningChip).toBeNull();
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("stop: com os campos completos, pergunta se foi concluída", () => {
    const { result, onOmniboxFocusHandled } = setup("stop");

    expect(result.current.confirmingStop).toBe(true);
    expect(result.current.fillingRequired).toBe(false);
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["nome", { name: null }],
    ["projeto", { projectId: null }],
    ["categoria", { categoryId: null }],
  ] as const)("stop: sem %s, abre o preenchimento obrigatório", (_, overrides) => {
    const { result, onOmniboxFocusHandled } = setup("stop", makeTask(overrides));

    expect(result.current.fillingRequired).toBe(true);
    expect(result.current.confirmingStop).toBe(false);
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("stop: espera os catálogos carregarem antes de abrir o preenchimento", () => {
    const task = makeTask({ name: null });
    const { result, rerender, onOmniboxFocusHandled } = setup("stop", task, true);

    expect(result.current.fillingRequired).toBe(false);
    expect(onOmniboxFocusHandled).not.toHaveBeenCalled();

    rerender({ omniboxFocus: "stop", task, catalogsLoading: false });

    expect(result.current.fillingRequired).toBe(true);
    expect(result.current.fillProjectName).toBe("Cliente A");
    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });

  it("pedido atendido não se repete quando a tarefa muda", () => {
    const { rerender, onOmniboxFocusHandled } = setup("stop");

    rerender({ omniboxFocus: null, task: makeTask({ name: "Outro nome" }) });

    expect(onOmniboxFocusHandled).toHaveBeenCalledTimes(1);
  });
});
