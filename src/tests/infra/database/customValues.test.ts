import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadCustomValues, saveCustomValues } from "@infra/database/customValues";

function makeDb() {
  return {
    select: vi.fn<(query: string, values?: unknown[]) => Promise<unknown>>(async () => []),
    execute: vi.fn<(query: string, values?: unknown[]) => Promise<unknown>>(async () => ({})),
  };
}

describe("loadCustomValues", () => {
  let db: ReturnType<typeof makeDb>;

  beforeEach(() => {
    db = makeDb();
  });

  it("não consulta nada quando não há ids", async () => {
    expect((await loadCustomValues(db, "task_custom_values", "task_id", [])).size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("resolve a leva inteira em uma única query", async () => {
    db.select.mockResolvedValue([
      { owner_id: "t1", field_id: "f1", value: "o1" },
      { owner_id: "t1", field_id: "f2", value: "x" },
      { owner_id: "t2", field_id: "f1", value: "o2" },
    ]);
    const map = await loadCustomValues(db, "task_custom_values", "task_id", ["t1", "t2"]);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(map.get("t1")).toEqual({ f1: "o1", f2: "x" });
    expect(map.get("t2")).toEqual({ f1: "o2" });
  });

  it("omite donos sem nenhum valor", async () => {
    db.select.mockResolvedValue([{ owner_id: "t1", field_id: "f1", value: "o1" }]);
    const map = await loadCustomValues(db, "task_custom_values", "task_id", ["t1", "t2"]);
    expect(map.has("t2")).toBe(false);
  });
});

describe("saveCustomValues", () => {
  it("apaga antes de inserir, para que limpar um campo suma do banco", async () => {
    const db = makeDb();
    await saveCustomValues(db, "task_custom_values", "task_id", "t1", { f1: "o1" });
    expect(db.execute.mock.calls[0][0]).toContain("DELETE FROM task_custom_values");
    expect(db.execute.mock.calls[1][0]).toContain("INSERT INTO task_custom_values");
  });

  it("não grava valor vazio", async () => {
    const db = makeDb();
    await saveCustomValues(db, "task_custom_values", "task_id", "t1", { f1: "", f2: "x" });
    const inserts = db.execute.mock.calls.filter(([sql]) => String(sql).includes("INSERT"));
    expect(inserts).toHaveLength(1);
    expect(inserts[0][1]).toEqual(["t1", "f2", "x"]);
  });
});
