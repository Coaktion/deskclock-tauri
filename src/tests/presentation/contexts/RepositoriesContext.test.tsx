import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { ICategoryRepository } from "@domain/repositories/ICategoryRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IExportProfileRepository } from "@domain/repositories/IExportProfileRepository";
import type { ITaskIntegrationLogRepository } from "@domain/repositories/ITaskIntegrationLogRepository";

const mockTaskRepo = { findById: vi.fn() } as unknown as ITaskRepository;
const mockPlannedTaskRepo = { findById: vi.fn() } as unknown as IPlannedTaskRepository;
const mockCategoryRepo = { findAll: vi.fn() } as unknown as ICategoryRepository;
const mockProjectRepo = { findAll: vi.fn() } as unknown as IProjectRepository;
const mockExportProfileRepo = { findAll: vi.fn() } as unknown as IExportProfileRepository;
const mockTaskLogRepo = { findSentIds: vi.fn() } as unknown as ITaskIntegrationLogRepository;

vi.mock("@presentation/contexts/repositories", () => ({
  taskRepo: mockTaskRepo,
  plannedTaskRepo: mockPlannedTaskRepo,
  categoryRepo: mockCategoryRepo,
  projectRepo: mockProjectRepo,
  exportProfileRepo: mockExportProfileRepo,
  taskLogRepo: mockTaskLogRepo,
}));

const { RepositoriesProvider, useRepositories } = await import(
  "@presentation/contexts/RepositoriesContext"
);

describe("RepositoriesContext", () => {
  it("lança erro quando usado fora do provider", () => {
    expect(() => renderHook(() => useRepositories())).toThrow(
      "useRepositories must be used within a RepositoriesProvider"
    );
  });

  it("retorna os repos padrão (singletons) quando nenhum valor é injetado", () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RepositoriesProvider>{children}</RepositoriesProvider>
    );
    const { result } = renderHook(() => useRepositories(), { wrapper });

    expect(result.current.taskRepo).toBe(mockTaskRepo);
    expect(result.current.plannedTaskRepo).toBe(mockPlannedTaskRepo);
    expect(result.current.categoryRepo).toBe(mockCategoryRepo);
    expect(result.current.projectRepo).toBe(mockProjectRepo);
    expect(result.current.exportProfileRepo).toBe(mockExportProfileRepo);
    expect(result.current.taskLogRepo).toBe(mockTaskLogRepo);
  });

  it("retorna repo injetado quando value parcial é fornecido", () => {
    const customTaskRepo = { findById: vi.fn() } as unknown as ITaskRepository;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RepositoriesProvider value={{ taskRepo: customTaskRepo }}>{children}</RepositoriesProvider>
    );
    const { result } = renderHook(() => useRepositories(), { wrapper });

    expect(result.current.taskRepo).toBe(customTaskRepo);
    expect(result.current.plannedTaskRepo).toBe(mockPlannedTaskRepo);
  });
});
