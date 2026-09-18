import { vi } from "vitest";

// Prevent Tauri API calls from crashing in test environment
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// O `listen` real toca `window.__TAURI_INTERNALS__`, que não existe no jsdom:
// sem este mock, todo componente que ouve evento no mount (o campo de data, via
// `useWeekStart`) despeja uma rejeição não tratada por render. Arquivo que
// precisa do barramento tem o seu próprio `vi.mock`, que tem precedência.
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
  emit: vi.fn(async () => {}),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({
      select: vi.fn(async () => []),
      execute: vi.fn(async () => ({ rowsAffected: 0, lastInsertId: 0 })),
    })),
  },
}));
