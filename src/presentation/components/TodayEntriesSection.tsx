import { useMemo, useState } from "react";
import { Send, CheckSquare, Square, X, Loader2 } from "lucide-react";
import type { Task } from "@domain/entities/Task";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { TaskGroup } from "@shared/utils/groupTasks";
import { NULLABLE_FIELDS, type TaskField } from "@shared/types/sheetsConfig";
import { TaskGroupCard } from "./TaskGroupCard";
import { EditTaskModal } from "@presentation/modals/EditTaskModal";
import { TaskRepository } from "@infra/database/TaskRepository";
import { deleteTask } from "@domain/usecases/tasks/DeleteTask";
import { updateTask } from "@domain/usecases/tasks/UpdateTask";
import { mergeTaskGroup } from "@domain/usecases/tasks/MergeTaskGroup";
import {
  sendTasks,
  NoIntegrationError,
  NoTasksSelectedError,
} from "@domain/usecases/tasks/SendTasks";
import { useRunningTask } from "@presentation/contexts/RunningTaskContext";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { GoogleSheetsTaskSender } from "@infra/integrations/GoogleSheetsTaskSender";
import { formatHHMMSS } from "@shared/utils/time";

const repo = new TaskRepository();

interface TodayEntriesSectionProps {
  groups: TaskGroup[];
  projects: Project[];
  categories: Category[];
  reload: () => void;
  totalSeconds: number;
}

function validateTasks(tasks: Task[], enabledFields: TaskField[]): string | null {
  const requiredNullable = NULLABLE_FIELDS.filter((f) => enabledFields.includes(f));
  if (requiredNullable.length === 0) return null;

  const fieldLabel: Record<TaskField, string> = {
    date: "data",
    name: "nome",
    project: "projeto",
    category: "categoria",
    billable: "billable",
    startTime: "início",
    endTime: "fim",
    duration: "duração",
  };

  const incomplete: string[] = [];
  for (const task of tasks) {
    const missing: string[] = [];
    if (requiredNullable.includes("name") && !task.name?.trim()) missing.push(fieldLabel.name);
    if (requiredNullable.includes("project") && !task.projectId) missing.push(fieldLabel.project);
    if (requiredNullable.includes("category") && !task.categoryId)
      missing.push(fieldLabel.category);
    if (missing.length > 0) {
      incomplete.push(`"${task.name ?? "(sem nome)"}" — faltam: ${missing.join(", ")}`);
    }
  }

  if (incomplete.length === 0) return null;
  return `Tarefas com dados incompletos:\n${incomplete.join("\n")}`;
}

export function TodayEntriesSection({
  groups,
  projects,
  categories,
  reload,
  totalSeconds,
}: TodayEntriesSectionProps) {
  const { startTask, runningTask } = useRunningTask();
  const config = useAppConfig();
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const googleSheetsSender = useMemo(() => {
    if (!config.isLoaded) return null;
    const spreadsheetId = config.get("integrationGoogleSheetsSpreadsheetId");
    const refreshToken = config.get("googleRefreshToken");
    if (!spreadsheetId || !refreshToken) return null;
    return new GoogleSheetsTaskSender(config, spreadsheetId, projects, categories);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.isLoaded, projects, categories]);

  // send mode
  const [sendMode, setSendMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [sendMessage, setSendMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  function enterSendMode() {
    setSendMode(true);
    setSelectedKeys(new Set());
    setSendMessage(null);
  }

  function exitSendMode() {
    setSendMode(false);
    setSelectedKeys(new Set());
    setSendMessage(null);
  }

  function selectAll() {
    setSelectedKeys(new Set(groups.map((g) => g.key)));
  }

  function deselectAll() {
    setSelectedKeys(new Set());
  }

  function toggleGroup(group: TaskGroup) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(group.key)) next.delete(group.key);
      else next.add(group.key);
      return next;
    });
  }

  async function handleSend() {
    setSendMessage(null);
    const selectedGroups = groups.filter((g) => selectedKeys.has(g.key));
    // Um registro por grupo: usa a primeira tarefa como base, soma a duração total
    const tasksToSend = selectedGroups.map((g) => ({
      ...g.tasks[0],
      durationSeconds: g.totalSeconds,
    }));
    const allTaskIds = selectedGroups.flatMap((g) => g.tasks.map((t) => t.id));

    // Valida dados obrigatórios antes de enviar
    const mapping = config.get("integrationGoogleSheetsColumnMapping");
    const enabledFields = mapping.filter((c) => c.enabled).map((c) => c.field);
    const validationError = validateTasks(tasksToSend, enabledFields);
    if (validationError) {
      setSendMessage({ text: validationError, error: true });
      return;
    }

    setSending(true);
    try {
      await sendTasks(googleSheetsSender, tasksToSend);
      await repo.markSentToSheets(allTaskIds);
      reload();
      setSendMessage({
        text: `${selectedGroups.length} grupo(s) enviado(s) com sucesso.`,
        error: false,
      });
      setSelectedKeys(new Set());
    } catch (err) {
      if (err instanceof NoIntegrationError) {
        setSendMessage({ text: "Nenhuma integração configurada.", error: true });
      } else if (err instanceof NoTasksSelectedError) {
        setSendMessage({ text: "Selecione ao menos uma tarefa.", error: true });
      } else {
        const msg = err instanceof Error ? err.message : "Erro ao enviar tarefas.";
        setSendMessage({ text: msg, error: true });
      }
    } finally {
      setSending(false);
    }
  }

  async function handlePlay(task: Task) {
    await startTask({
      name: task.name,
      projectId: task.projectId,
      categoryId: task.categoryId,
      billable: task.billable,
    });
  }

  async function handleDelete(task: Task) {
    await deleteTask(repo, task.id);
    reload();
  }

  async function handleToggleBillable(task: Task) {
    await updateTask(repo, task.id, { billable: !task.billable }, new Date().toISOString());
    reload();
  }

  async function handleMerge(group: TaskGroup) {
    await mergeTaskGroup(repo, group.tasks, new Date().toISOString());
    reload();
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-300">Entradas de hoje</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono tabular-nums text-gray-500">{formatHHMMSS(totalSeconds)}</span>
          {!sendMode && groups.length > 0 && (
            <button
              onClick={enterSendMode}
              title="Modo de envio"
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors"
            >
              <Send size={12} />
              Enviar
            </button>
          )}
        </div>
      </div>

      {sendMode && (
        <div className="mb-3 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={selectAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <CheckSquare size={13} />
              Selecionar todas
            </button>
            <button
              onClick={deselectAll}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
            >
              <Square size={13} />
              Desmarcar todas
            </button>
            <div className="flex-1" />
            <button
              onClick={handleSend}
              disabled={sending || selectedKeys.size === 0}
              className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-2 py-1 rounded-lg"
            >
              {sending ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Enviando…
                </>
              ) : (
                <>
                  <Send size={12} />
                  Enviar selecionadas ({selectedKeys.size})
                </>
              )}
            </button>
            <button
              onClick={exitSendMode}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
              <X size={13} />
              Cancelar
            </button>
          </div>
          {sendMessage && (
            <p
              className={`text-xs whitespace-pre-line ${sendMessage.error ? "text-red-400" : "text-green-400"}`}
            >
              {sendMessage.text}
            </p>
          )}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-gray-600 text-center py-6">Nenhuma entrada hoje.</p>
      ) : (
        <div className="space-y-2">
          {groups.map((g) => (
            <TaskGroupCard
              key={g.key}
              group={g}
              projects={projects}
              categories={categories}
              playDisabled={!!runningTask}
              selectable={sendMode}
              selected={selectedKeys.has(g.key)}
              onToggleSelect={toggleGroup}
              onPlay={handlePlay}
              onEdit={setEditingTask}
              onDelete={handleDelete}
              onMerge={handleMerge}
              onToggleBillable={handleToggleBillable}
            />
          ))}
        </div>
      )}

      {editingTask && (
        <EditTaskModal
          task={editingTask}
          projects={projects}
          categories={categories}
          onSave={reload}
          onClose={() => setEditingTask(null)}
        />
      )}
    </section>
  );
}
