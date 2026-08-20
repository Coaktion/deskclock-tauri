import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import type { ITaskRepository } from "@domain/repositories/ITaskRepository";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import { RepositoriesProvider, useRepositories } from "@presentation/contexts/RepositoriesContext";

vi.mock("@infra/database/TaskRepository", () => ({ TaskRepository: vi.fn(() => ({})) }));
vi.mock("@infra/database/PlannedTaskRepository", () => ({
  PlannedTaskRepository: vi.fn(() => ({})),
}));
vi.mock("@infra/database/CategoryRepository", () => ({ CategoryRepository: vi.fn(() => ({})) }));
vi.mock("@infra/database/ProjectRepository", () => ({ ProjectRepository: vi.fn(() => ({})) }));
vi.mock("@infra/database/ExportProfileRepository", () => ({
  ExportProfileRepository: vi.fn(() => ({})),
}));
vi.mock("@infra/database/TaskIntegrationLogRepository", () => ({
  TaskIntegrationLogRepository: vi.fn(() => ({})),
}));

describe("RepositoriesContext", () => {
  it("lança erro quando usado fora do provider", () => {
    expect(() => renderHook(() => useRepositories())).toThrow(
      "useRepositories must be used within a RepositoriesProvider"
    );
  });

  it("retorna repo injetado quando value parcial é fornecido", () => {
    const customTaskRepo = { findById: vi.fn() } as unknown as ITaskRepository;
    const customPlannedTaskRepo = { findAll: vi.fn() } as unknown as IPlannedTaskRepository;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RepositoriesProvider
        value={{ taskRepo: customTaskRepo, plannedTaskRepo: customPlannedTaskRepo }}
      >
        {children}
      </RepositoriesProvider>
    );
    const { result } = renderHook(() => useRepositories(), { wrapper });

    expect(result.current.taskRepo).toBe(customTaskRepo);
    expect(result.current.plannedTaskRepo).toBe(customPlannedTaskRepo);
  });

  it("retorna instâncias padrão para repos não injetados", () => {
    const customTaskRepo = { findById: vi.fn() } as unknown as ITaskRepository;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <RepositoriesProvider value={{ taskRepo: customTaskRepo }}>{children}</RepositoriesProvider>
    );
    const { result } = renderHook(() => useRepositories(), { wrapper });

    expect(result.current.taskRepo).toBe(customTaskRepo);
    expect(result.current.categoryRepo).toBeDefined();
    expect(result.current.projectRepo).toBeDefined();
  });
});
