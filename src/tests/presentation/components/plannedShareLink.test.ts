import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlannedTask } from "@domain/entities/PlannedTask";
import { copyPlannedTaskLink } from "@presentation/components/plannedShareLink";
import { showToast } from "@shared/utils/toast";

vi.mock("@shared/utils/toast", () => ({ showToast: vi.fn(() => Promise.resolve()) }));

const task: PlannedTask = {
  id: "t1",
  workspaceId: "ws-1",
  name: "Revisão de PRs",
  projectId: null,
  categoryId: null,
  billable: true,
  scheduleType: "specific_date",
  scheduleDate: "2026-04-08",
  recurringDays: null,
  periodStart: null,
  periodEnd: null,
  completedDates: [],
  actions: [],
  sortOrder: 0,
  createdAt: "2026-04-08T09:00:00.000Z",
  customValues: {},
};

function stubClipboard(writeText: () => Promise<void>) {
  const spy = vi.fn(writeText);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: spy }, configurable: true });
  return spy;
}

afterEach(() => vi.clearAllMocks());

describe("copyPlannedTaskLink", () => {
  it("copia o deeplink e avisa o sucesso", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    await copyPlannedTaskLink(task, [], [], []);
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/^deskclock:\/\/task\/share/));
    expect(showToast).toHaveBeenCalledWith("success", "Link copiado para a área de transferência.");
  });

  it("com a área de transferência recusando, avisa o erro e não rejeita", async () => {
    stubClipboard(() => Promise.reject(new Error("negado")));
    await expect(copyPlannedTaskLink(task, [], [], [])).resolves.toBeUndefined();
    expect(showToast).toHaveBeenCalledWith("error", "Não foi possível copiar o link.");
    expect(showToast).toHaveBeenCalledTimes(1);
  });
});
