import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Project } from "@domain/entities/Project";
import { DEFAULT_WORKSPACE_ID } from "@domain/entities/Workspace";
import type { IConfigRepository } from "@domain/repositories/IConfigRepository";
import type { IProjectRepository } from "@domain/repositories/IProjectRepository";
import type { IWorkspaceRepository } from "@domain/repositories/IWorkspaceRepository";
import { ConfigProvider } from "@presentation/contexts/ConfigContext";
import { RepositoriesProvider } from "@presentation/contexts/RepositoriesContext";
import { WorkspaceProvider } from "@presentation/contexts/WorkspaceContext";
import { useProjects } from "@presentation/hooks/useProjects";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";

// Registro de ouvintes no lugar do barramento do Tauri: `fire` faz o papel de
// outra janela emitindo o evento.
const handlers = new Map<string, Set<() => void>>();

function fire(event: string) {
  handlers.get(event)?.forEach((cb) => cb());
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: (event: string, cb: () => void) => {
    const set = handlers.get(event) ?? new Set();
    set.add(cb);
    handlers.set(event, set);
    return Promise.resolve(() => set.delete(cb));
  },
  emit: (event: string) => {
    fire(event);
    return Promise.resolve();
  },
}));

const WORKSPACE = {
  id: DEFAULT_WORKSPACE_ID,
  name: "Padrão",
  color: "teal",
  createdAt: "2026-01-01T00:00:00Z",
};

function project(name: string): Project {
  return { id: `p-${name}`, workspaceId: DEFAULT_WORKSPACE_ID, name };
}

function makeWrapper(projectRepo: IProjectRepository) {
  const configRepo: IConfigRepository = {
    get: vi.fn((_key, defaultValue) => Promise.resolve(defaultValue)),
    loadAll: vi.fn(() => Promise.resolve({})),
    set: vi.fn(() => Promise.resolve()),
    delete: vi.fn(() => Promise.resolve()),
  };
  const workspaceRepo = {
    findAll: vi.fn(async () => [WORKSPACE]),
  } as unknown as IWorkspaceRepository;

  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ConfigProvider repository={configRepo}>
        <RepositoriesProvider value={{ projectRepo, workspaceRepo }}>
          <WorkspaceProvider>{children}</WorkspaceProvider>
        </RepositoriesProvider>
      </ConfigProvider>
    );
  };
}

describe("useProjects", () => {
  beforeEach(() => {
    handlers.clear();
    vi.clearAllMocks();
  });

  it("recarrega quando outra janela avisa que o catálogo mudou", async () => {
    // O overlay-popup nasce com o app e nunca remonta: sem este recarregamento,
    // um projeto importado depois nunca apareceria lá.
    let stored = [project("Cliente A")];
    const projectRepo = {
      findAll: vi.fn(async () => stored),
    } as unknown as IProjectRepository;

    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper(projectRepo) });

    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    stored = [project("Cliente A"), project("Cliente B")];
    fire(OVERLAY_EVENTS.PROJECTS_CHANGED);

    await waitFor(() => expect(result.current.projects).toHaveLength(2));
  });

  it("criar um projeto avisa as outras janelas", async () => {
    const projectRepo = {
      findAll: vi.fn(async () => []),
      findByName: vi.fn(async () => null),
      save: vi.fn(async () => {}),
    } as unknown as IProjectRepository;

    const outsider = vi.fn();
    handlers.set(OVERLAY_EVENTS.PROJECTS_CHANGED, new Set([outsider]));

    const { result } = renderHook(() => useProjects(), { wrapper: makeWrapper(projectRepo) });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(() => result.current.createProject("Cliente C"));

    expect(outsider).toHaveBeenCalled();
  });
});
