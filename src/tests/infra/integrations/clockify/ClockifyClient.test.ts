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

  describe("listTimeEntries", () => {
    const USER_ID = "u1";
    const START = "2026-04-30T00:00:00.000Z";
    const END = "2026-04-30T23:59:59.999Z";

    it("usa endpoint /user/:id/time-entries com hydrated=true e encoda datas", async () => {
      mockFetch.mockResolvedValue(makeResponse([]));

      const client = new ClockifyClient(API_KEY);
      await client.listTimeEntries(WORKSPACE_ID, USER_ID, START, END);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain(`/workspaces/${WORKSPACE_ID}/user/${USER_ID}/time-entries`);
      expect(url).toContain("hydrated=true");
      expect(url).toContain(`start=${encodeURIComponent(START)}`);
      expect(url).toContain(`end=${encodeURIComponent(END)}`);
      expect(url).toContain("page=1");
    });

    it("retorna entries hidratadas em uma única página", async () => {
      const entries = [
        {
          id: "e1",
          description: "Tarefa",
          projectId: "p1",
          tagIds: ["t1"],
          billable: true,
          timeInterval: { start: START, end: END, duration: "PT1H" },
          project: { id: "p1", name: "Proj", clientName: "Cliente", color: "#fff" },
          tags: [{ id: "t1", name: "tag1" }],
        },
      ];
      mockFetch.mockResolvedValue(makeResponse(entries));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listTimeEntries(WORKSPACE_ID, USER_ID, START, END);

      expect(result).toEqual(entries);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it("pagina automaticamente quando retorna page-size completo (1000)", async () => {
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: `e${i}`,
        description: "",
        projectId: null,
        tagIds: [],
        billable: false,
        timeInterval: { start: START, end: END, duration: null },
      }));
      const page2 = [
        {
          id: "e1000",
          description: "",
          projectId: null,
          tagIds: [],
          billable: false,
          timeInterval: { start: START, end: END, duration: null },
        },
      ];

      mockFetch
        .mockResolvedValueOnce(makeResponse(page1))
        .mockResolvedValueOnce(makeResponse(page2));

      const client = new ClockifyClient(API_KEY);
      const result = await client.listTimeEntries(WORKSPACE_ID, USER_ID, START, END);

      expect(result).toHaveLength(1001);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining("page=2"),
        expect.anything()
      );
    });

    it("lança ClockifyAuthError em 401", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 401));
      const client = new ClockifyClient(API_KEY);
      await expect(
        client.listTimeEntries(WORKSPACE_ID, USER_ID, START, END)
      ).rejects.toBeInstanceOf(ClockifyAuthError);
    });
  });

  describe("updateTimeEntry", () => {
    it("faz PUT para o endpoint da entry e envia o payload", async () => {
      const updated = {
        id: "e1",
        description: "Atualizado",
        projectId: "p1",
        tagIds: ["t1"],
        billable: false,
        timeInterval: { start: "2026-04-30T09:00:00Z", end: "2026-04-30T10:00:00Z", duration: "PT1H" },
      };
      mockFetch.mockResolvedValue(makeResponse(updated));

      const client = new ClockifyClient(API_KEY);
      const payload = {
        start: "2026-04-30T09:00:00Z",
        end: "2026-04-30T10:00:00Z",
        description: "Atualizado",
        projectId: "p1",
        tagIds: ["t1"],
        billable: false,
      };
      const result = await client.updateTimeEntry(WORKSPACE_ID, "e1", payload);

      expect(result).toEqual(updated);
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.clockify.me/api/v1/workspaces/${WORKSPACE_ID}/time-entries/e1`,
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(payload),
          headers: expect.objectContaining({
            "X-Api-Key": API_KEY,
            "Content-Type": "application/json",
          }),
        })
      );
    });

    it("lança ClockifyValidationError em 400 da API", async () => {
      mockFetch.mockResolvedValue(makeResponse({ message: "Invalid range" }, 400));
      const client = new ClockifyClient(API_KEY);
      await expect(
        client.updateTimeEntry(WORKSPACE_ID, "e1", {
          start: "2026-04-30T10:00:00Z",
          end: "2026-04-30T09:00:00Z",
          description: "",
          billable: false,
        })
      ).rejects.toBeInstanceOf(ClockifyValidationError);
    });
  });

  describe("deleteTimeEntry", () => {
    it("faz DELETE no endpoint correto e resolve sem erro em 204", async () => {
      mockFetch.mockResolvedValue(makeResponse(null, 204));

      const client = new ClockifyClient(API_KEY);
      await expect(client.deleteTimeEntry(WORKSPACE_ID, "e1")).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        `https://api.clockify.me/api/v1/workspaces/${WORKSPACE_ID}/time-entries/e1`,
        expect.objectContaining({ method: "DELETE" })
      );
    });

    it("lança ClockifyAuthError em 401", async () => {
      mockFetch.mockResolvedValue(makeResponse({}, 401));
      const client = new ClockifyClient(API_KEY);
      await expect(
        client.deleteTimeEntry(WORKSPACE_ID, "e1")
      ).rejects.toBeInstanceOf(ClockifyAuthError);
    });

    it("lança ClockifyNetworkError em falha de rede", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      const client = new ClockifyClient(API_KEY);
      await expect(
        client.deleteTimeEntry(WORKSPACE_ID, "e1")
      ).rejects.toBeInstanceOf(ClockifyNetworkError);
    });
  });
});
