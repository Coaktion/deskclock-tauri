import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ClockifyAuthError,
  ClockifyNetworkError,
  ClockifyRateLimitError,
  ClockifyValidationError,
} from "@infra/integrations/clockify/errors";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const { ClockifyClient } = await import("@infra/integrations/clockify/ClockifyClient");

const API_KEY = "test-api-key";
const WORKSPACE_ID = "ws1";

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ClockifyClient", () => {
  describe("getUser", () => {
    it("envia X-Api-Key e retorna usuário", async () => {
      const user = { id: "u1", name: "Eduardo", email: "e@test.com", defaultWorkspace: "ws1" };
      mockFetch.mockResolvedValue(makeResponse(user));

      const client = new ClockifyClient(API_KEY);
      const result = await client.getUser();

      expect(result).toEqual(user);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.clockify.me/api/v1/user",
        expect.objectContaining({
          headers: expect.objectContaining({ "X-Api-Key": API_KEY }),
        })
      );
    });

    it("lança ClockifyAuthError em 401", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 401));
      const client = new ClockifyClient(API_KEY);
      await expect(client.getUser()).rejects.toBeInstanceOf(ClockifyAuthError);
    });

    it("lança ClockifyRateLimitError em 429", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 429));
      const client = new ClockifyClient(API_KEY);
      await expect(client.getUser()).rejects.toBeInstanceOf(ClockifyRateLimitError);
    });

    it("lança ClockifyValidationError em 400 com mensagem da API", async () => {
      mockFetch.mockResolvedValue(makeResponse({ message: "Bad request" }, 400));
      const client = new ClockifyClient(API_KEY);
      await expect(client.getUser()).rejects.toBeInstanceOf(ClockifyValidationError);
    });

    it("lança ClockifyNetworkError em falha de rede", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const client = new ClockifyClient(API_KEY);
      await expect(client.getUser()).rejects.toBeInstanceOf(ClockifyNetworkError);
    });
  });

  describe("listWorkspaces", () => {
    it("retorna lista de workspaces", async () => {
      const workspaces = [{ id: "ws1", name: "Workspace 1" }];
      mockFetch.mockResolvedValue(makeResponse(workspaces));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listWorkspaces();

      expect(result).toEqual(workspaces);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.clockify.me/api/v1/workspaces",
        expect.anything()
      );
    });
  });

  describe("listProjects", () => {
    it("retorna projetos da primeira página se menos que PAGE_SIZE", async () => {
      const projects = [{ id: "p1", name: "Projeto A", archived: false }];
      mockFetch.mockResolvedValue(makeResponse(projects));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listProjects(WORKSPACE_ID);

      expect(result).toEqual(projects);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/workspaces/${WORKSPACE_ID}/projects`),
        expect.anything()
      );
    });

    it("pagina automaticamente quando retorna exatamente PAGE_SIZE (200) itens", async () => {
      const page1 = Array.from({ length: 200 }, (_, i) => ({
        id: `p${i}`,
        name: `Projeto ${i}`,
        archived: false,
      }));
      const page2 = [{ id: "p200", name: "Projeto 200", archived: false }];

      mockFetch
        .mockResolvedValueOnce(makeResponse(page1))
        .mockResolvedValueOnce(makeResponse(page2));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listProjects(WORKSPACE_ID);

      expect(result).toHaveLength(201);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
    });
  });

  describe("listTags", () => {
    it("retorna tags do workspace", async () => {
      const tags = [{ id: "t1", name: "faturável", archived: false }];
      mockFetch.mockResolvedValue(makeResponse(tags));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listTags(WORKSPACE_ID);

      expect(result).toEqual(tags);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/workspaces/${WORKSPACE_ID}/tags`),
        expect.anything()
      );
    });
  });

  describe("createTimeEntry", () => {
    it("faz POST com payload correto e retorna entry criada", async () => {
      const entry = { id: "te1" };
      mockFetch.mockResolvedValue(makeResponse(entry));

      const client = new ClockifyClient(API_KEY);
      const payload = {
        start: "2026-04-30T09:00:00Z",
        end: "2026-04-30T10:00:00Z",
        description: "Tarefa teste",
        projectId: "p1",
        tagIds: ["t1", "t2"],
        billable: true,
      };

      const result = await client.createTimeEntry(WORKSPACE_ID, payload);

      expect(result).toEqual(entry);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.clockify.me/api/v1/workspaces/${WORKSPACE_ID}/time-entries`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            "X-Api-Key": API_KEY,
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("lança ClockifyAuthError se 401 ao criar entrada", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 401));
      const client = new ClockifyClient(API_KEY);
      await expect(
        client.createTimeEntry(WORKSPACE_ID, {
          start: "2026-04-30T09:00:00Z",
          end: "2026-04-30T10:00:00Z",
          description: "",
          billable: false,
        })
      ).rejects.toBeInstanceOf(ClockifyAuthError);
    });
  });
});
