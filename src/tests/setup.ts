import { vi } from "vitest";

// Prevent Tauri API calls from crashing in test environment
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({
      select: vi.fn(async () => []),
      execute: vi.fn(async () => ({ rowsAffected: 0, lastInsertId: 0 })),
    })),
  },
}));
