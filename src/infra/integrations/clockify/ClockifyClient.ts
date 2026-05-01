import type {
  ClockifyUser,
  ClockifyWorkspace,
  ClockifyProject,
  ClockifyTag,
  ClockifyTimeEntry,
  ClockifyTimeEntryFull,
  ClockifyTimeEntryPayload,
} from "./types";
import {
  ClockifyAuthError,
  ClockifyNetworkError,
  ClockifyRateLimitError,
  ClockifyValidationError,
} from "./errors";

const BASE_URL = "https://api.clockify.me/api/v1";
const PAGE_SIZE = 200;
const TIME_ENTRIES_PAGE_SIZE = 1000;

export class ClockifyClient {
  constructor(private readonly apiKey: string) {}

  private headers(): Record<string, string> {
    return {
      "X-Api-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init?.headers ?? {}) },
      });
    } catch (err) {
      throw new ClockifyNetworkError(err);
    }

    if (res.status === 401) throw new ClockifyAuthError();
    if (res.status === 429) throw new ClockifyRateLimitError();

    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as Record<string, unknown>;
      const msg = typeof body.message === "string"
        ? body.message
        : `Erro HTTP ${res.status} no Clockify.`;
      throw new ClockifyValidationError(msg);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  getUser(): Promise<ClockifyUser> {
    return this.request<ClockifyUser>("/user");
  }

  listWorkspaces(): Promise<ClockifyWorkspace[]> {
    return this.request<ClockifyWorkspace[]>("/workspaces");
  }

  async listProjects(workspaceId: string): Promise<ClockifyProject[]> {
    const all: ClockifyProject[] = [];
    let page = 1;
    while (true) {
      const chunk = await this.request<ClockifyProject[]>(
        `/workspaces/${workspaceId}/projects?archived=false&page-size=${PAGE_SIZE}&page=${page}`
      );
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  async listTags(workspaceId: string): Promise<ClockifyTag[]> {
    const all: ClockifyTag[] = [];
    let page = 1;
    while (true) {
      const chunk = await this.request<ClockifyTag[]>(
        `/workspaces/${workspaceId}/tags?archived=false&page-size=${PAGE_SIZE}&page=${page}`
      );
      all.push(...chunk);
      if (chunk.length < PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  createTimeEntry(workspaceId: string, entry: ClockifyTimeEntryPayload): Promise<ClockifyTimeEntry> {
    return this.request<ClockifyTimeEntry>(
      `/workspaces/${workspaceId}/time-entries`,
      { method: "POST", body: JSON.stringify(entry) }
    );
  }

  async listTimeEntries(
    workspaceId: string,
    userId: string,
    start: string,
    end: string,
  ): Promise<ClockifyTimeEntryFull[]> {
    const all: ClockifyTimeEntryFull[] = [];
    let page = 1;
    while (true) {
      const chunk = await this.request<ClockifyTimeEntryFull[]>(
        `/workspaces/${workspaceId}/user/${userId}/time-entries`
          + `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
          + `&hydrated=true&page-size=${TIME_ENTRIES_PAGE_SIZE}&page=${page}`
      );
      all.push(...chunk);
      if (chunk.length < TIME_ENTRIES_PAGE_SIZE) break;
      page++;
    }
    return all;
  }

  updateTimeEntry(
    workspaceId: string,
    entryId: string,
    payload: ClockifyTimeEntryPayload,
  ): Promise<ClockifyTimeEntryFull> {
    return this.request<ClockifyTimeEntryFull>(
      `/workspaces/${workspaceId}/time-entries/${entryId}`,
      { method: "PUT", body: JSON.stringify(payload) }
    );
  }

  async deleteTimeEntry(workspaceId: string, entryId: string): Promise<void> {
    await this.request<void>(
      `/workspaces/${workspaceId}/time-entries/${entryId}`,
      { method: "DELETE" }
    );
  }
}
