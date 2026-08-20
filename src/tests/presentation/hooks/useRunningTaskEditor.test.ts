import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { Category } from "@domain/entities/Category";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { localISO } from "../../helpers/localTime";

// O recorte de categorias por projeto vive atrás dos contextos de repositório e
// de workspace (§6.7); o que este hook faz com ele é repassar a lista.
vi.mock("@presentation/hooks/useProjectCategoryMap", () => ({
  useProjectCategoryMap: () => ({ categoriesFor: (categories: Category[]) => categories }),
}));

const { useRunningTaskEditor } = await import("@presentation/hooks/useRunningTaskEditor");

const PROJECTS: Project[] = [
  { id: "p1", workspaceId: "ws1", name: "Cliente A", colorIndex: 0, createdAt: "" },
  { id: "p2", workspaceId: "ws1", name: "Cliente B", colorIndex: 1, createdAt: "" },
] as unknown as Project[];

const CATEGORIES: Category[] = [
  { id: "c1", workspaceId: "ws1", name: "Desenvolvimento", defaultBillable: true, createdAt: "" },
  { id: "c2", workspaceId: "ws1", name: "Interno", defaultBillable: false, createdAt: "" },
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

function setup(task: Task = makeTask()) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  const { result } = renderHook(() =>
    useRunningTaskEditor({ task, projects: PROJECTS, categories: CATEGORIES, onSave, onClose })
  );
  return { result, onSave, onClose };
}

describe("useRunningTaskEditor", () => {
  it("semeia os campos da tarefa, com os nomes dos catálogos", () => {
    const { result } = setup();

    expect(result.current.name).toBe("Ajustes no relatório mensal");
    expect(result.current.projectName).toBe("Cliente A");
    expect(result.current.categoryName).toBe("Desenvolvimento");
    expect(result.current.billable).toBe(true);
    expect(result.current.startTime).toBe("09:30");
  });

  it("trocar de projeto zera a categoria — o recorte de opções mudou", () => {
    const { result } = setup();

    act(() => result.current.selectProject({ id: "p2", name: "Cliente B" }));

    expect(result.current.projectName).toBe("Cliente B");
    expect(result.current.categoryName).toBe("");
  });

  it("trocar de categoria arrasta o billable padrão dela", () => {
    const { result } = setup();

    act(() => result.current.selectCategory({ id: "c2", name: "Interno" }));

    expect(result.current.billable).toBe(false);
  });

  it("salva os campos editados e fecha o painel", async () => {
    const { result, onSave, onClose } = setup();

    act(() => result.current.setName("  Fechamento do mês  "));
    act(() => result.current.selectCategory({ id: "c2", name: "Interno" }));
    await act(() => result.current.save());

    expect(onSave).toHaveBeenCalledWith({
      name: "Fechamento do mês",
      projectId: "p1",
      categoryId: "c2",
      billable: false,
      customValues: {},
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("nome vazio grava null, e não a string em branco", async () => {
    const { result, onSave } = setup();

    act(() => result.current.setName("   "));
    await act(() => result.current.save());

    expect(onSave.mock.calls[0][0].name).toBeNull();
  });

  it("a hora inalterada não entra no payload", async () => {
    const { result, onSave } = setup();

    await act(() => result.current.save());

    expect(onSave.mock.calls[0][0]).not.toHaveProperty("startTime");
  });

  it("a hora alterada entra como instante, mantendo o dia da tarefa", async () => {
    const { result, onSave } = setup();

    act(() => result.current.setStartTime("08:15"));
    await act(() => result.current.save());

    const saved = new Date(onSave.mock.calls[0][0].startTime as string);
    expect(saved.getHours()).toBe(8);
    expect(saved.getMinutes()).toBe(15);
    expect(saved.getDate()).toBe(15);
  });

  it("não ressincroniza quando a tarefa muda por fora — o que está sendo digitado fica", () => {
    const { result, rerender } = renderHook(
      ({ task }) =>
        useRunningTaskEditor({
          task,
          projects: PROJECTS,
          categories: CATEGORIES,
          onSave: vi.fn(),
          onClose: vi.fn(),
        }),
      { initialProps: { task: makeTask() } }
    );

    act(() => result.current.setName("Rascunho"));
    rerender({ task: makeTask({ name: "Renomeada por outra janela" }) });

    expect(result.current.name).toBe("Rascunho");
  });
});
