import type { Task } from "@domain/entities/Task";
import type { ITaskSender } from "@domain/integrations/ITaskSender";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { ConfigContextValue } from "@presentation/contexts/ConfigContext";
import type { TaskField } from "@shared/types/sheetsConfig";
import { validateTaskForSheets } from "@domain/integrations/taskValidation";
import { GoogleTokenManager } from "./google/GoogleTokenManager";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export class GoogleSheetsTaskSender implements ITaskSender {
  readonly integrationName = "Google Sheets";
  private tokenManager: GoogleTokenManager;

  constructor(
    private config: ConfigContextValue,
    private spreadsheetId: string,
    private projects: Project[],
    private categories: Category[]
  ) {
    this.tokenManager = new GoogleTokenManager(config);
  }

  async send(tasks: Task[]): Promise<void> {
    const validTasks = tasks.filter((t) => validateTaskForSheets(t).ok);
    if (validTasks.length === 0 && tasks.length > 0) {
      throw new Error(
        "Nenhuma tarefa válida para enviar ao Google Sheets (precisa de nome, projeto e categoria)."
      );
    }
    if (validTasks.length === 0) return;

    const token = await this.tokenManager.getValidAccessToken();
    const sheetName = this.config.get("integrationGoogleSheetsSheetName") || "DeskClock";
    const mapping = this.config.get("integrationGoogleSheetsColumnMapping");
    const enabledCols = mapping.filter((c) => c.enabled);

    const sheetId = await this.ensureSheetExists(token, sheetName, enabledCols.map((c) => c.label));

    const rows = validTasks.map((t) =>
      this.taskToRow(
        t,
        enabledCols.map((c) => c.field)
      )
    );

    // Descobre a primeira linha vazia contando linhas ocupadas na coluna A
    const colAUrl = `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}/values/${encodeURIComponent(`${sheetName}!A:A`)}`;
    const colARes = await fetch(colAUrl, { headers: { Authorization: `Bearer ${token}` } });
    const colABody = await colARes.json().catch(() => ({}));
    const existingRows: unknown[][] = colABody.values ?? [];
    const nextRow = existingRows.length + 1;

    // Escreve as linhas com range explícito (values.update)
    const lastCol = colLetter(enabledCols.length);
    const writeRange = encodeURIComponent(
      `${sheetName}!A${nextRow}:${lastCol}${nextRow + rows.length - 1}`
    );
    const url = `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}/values/${writeRange}?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: rows }),
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(
        body?.error?.message ?? `Erro HTTP ${res.status} ao enviar para o Google Sheets.`
      );
    }

    const updatedRows: number = body?.updatedRows ?? 0;
    if (updatedRows === 0) {
      throw new Error(
        `A planilha aceitou a requisição mas nenhuma linha foi escrita. ` +
          `Verifique o nome da aba "${sheetName}" e as permissões da planilha.`
      );
    }

    // Aplica formato de duração [h]:mm:ss na coluna de duração das linhas recém-escritas
    const durationColIndex = enabledCols.findIndex((c) => c.field === "duration");
    if (sheetId !== -1 && durationColIndex !== -1) {
      await fetch(
        `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}:batchUpdate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex: nextRow - 1,
                    endRowIndex: nextRow + rows.length - 1,
                    startColumnIndex: durationColIndex,
                    endColumnIndex: durationColIndex + 1,
                  },
                  cell: {
                    userEnteredFormat: {
                      numberFormat: { type: "TIME", pattern: "[h]:mm:ss" },
                    },
                  },
                  fields: "userEnteredFormat.numberFormat",
                },
              },
            ],
          }),
        }
      ).catch(() => {
        // Falha silenciosa: dados já foram escritos; formato é cosmético
      });
    }
  }

  private async ensureSheetExists(
    token: string,
    sheetName: string,
    headers: string[]
  ): Promise<number> {
    const metaUrl = `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}?fields=sheets.properties`;
    const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });

    if (!metaRes.ok) return -1;

    const meta = await metaRes.json();
    const sheets: { properties: { title: string; sheetId: number } }[] = meta.sheets ?? [];
    const existing = sheets.find((s) => s.properties.title === sheetName);
    if (existing) return existing.properties.sheetId;

    // Cria nova aba
    const createRes = await fetch(
      `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title: sheetName } } }],
        }),
      }
    );

    const createBody = await createRes.json().catch(() => ({}));
    const newSheetId: number = createBody?.replies?.[0]?.addSheet?.properties?.sheetId ?? -1;

    // Escreve cabeçalhos
    const headerRange = encodeURIComponent(`${sheetName}!A1`);
    await fetch(
      `${SHEETS_API}/${encodeURIComponent(this.spreadsheetId)}/values/${headerRange}?valueInputOption=USER_ENTERED`,
      {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ values: [headers] }),
      }
    );

    return newSheetId;
  }

  private taskToRow(task: Task, fields: TaskField[]): (string | number)[] {
    const start = new Date(task.startTime);
    const project = this.projects.find((p) => p.id === task.projectId);
    const category = this.categories.find((c) => c.id === task.categoryId);

    const fmt2 = (n: number) => String(n).padStart(2, "0");
    const fmtDate = (d: Date) =>
      `${fmt2(d.getDate())}/${fmt2(d.getMonth() + 1)}/${d.getFullYear()}`;
    const fmtTime = (d: Date) => `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;

    const valueFor = (field: TaskField): string | number => {
      switch (field) {
        case "date":
          return fmtDate(start);
        case "name":
          return task.name ?? "(sem nome)";
        case "project":
          return project?.name ?? "";
        case "category":
          return category?.name ?? "";
        case "billable":
          return task.billable ? "Sim" : "Não";
        case "startTime":
          return fmtTime(start);
        case "endTime":
          return task.endTime ? fmtTime(new Date(task.endTime)) : "";
        // Envia como fração de dia para que o Sheets reconheça como duração nativa
        case "duration":
          return task.durationSeconds != null ? task.durationSeconds / 86400 : "";
      }
    };

    return fields.map(valueFor);
  }
}

/** Converte índice 1-based para letra de coluna: 1→A, 2→B, …, 26→Z, 27→AA */
export function colLetter(n: number): string {
  let result = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}
