import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Pen, Plus, Trash2, X } from "lucide-react";
import type { Workspace } from "@domain/entities/Workspace";
import { WORKSPACE_COLORS } from "@domain/utils/workspaceColor";
import { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useWorkspaceSwitchGuard } from "@presentation/hooks/useWorkspaceSwitchGuard";
import { WorkspaceDot, workspaceClasses } from "@presentation/components/WorkspaceDot";
import { DeleteWorkspaceModal } from "@presentation/modals/DeleteWorkspaceModal";

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {WORKSPACE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={c}
          className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${
            workspaceClasses(c).dot
          } ${value === c ? "ring-2 ring-offset-2 ring-offset-gray-900 ring-gray-300 scale-105" : "opacity-60 hover:opacity-100"}`}
        >
          {value === c && <Check size={11} className="text-gray-900" />}
        </button>
      ))}
    </div>
  );
}

export function WorkspacesPanel({ showTitle = true }: { showTitle?: boolean }) {
  const { workspaces, activeWorkspaceId, create, update, remove } = useWorkspaceAdmin();
  const { runningTask, stopTask } = useRunningTask();
  const { pending, request, confirm, cancel } = useWorkspaceSwitchGuard({ runningTask, stopTask });

  const [newName, setNewName] = useState("");
  // A cor do formulário é fixa: existe um seletor logo abaixo, e um preview que
  // muda a cada tecla faria a escolha do usuário parecer instável.
  const [newColor, setNewColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [deleting, setDeleting] = useState<Workspace | null>(null);

  /** Primeiro slot ainda não usado — só muda quando a lista de workspaces muda. */
  const suggestedColor = useMemo(() => {
    const used = new Set(workspaces.map((w) => w.color));
    return WORKSPACE_COLORS.find((c) => !used.has(c)) ?? WORKSPACE_COLORS[0];
  }, [workspaces]);

  const previewColor = newColor ?? suggestedColor;

  async function handleAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await create(newName, previewColor);
      setNewName("");
      setNewColor(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível criar o workspace.");
    }
  }

  function startEdit(w: Workspace) {
    setEditingId(w.id);
    setEditName(w.name);
    setEditColor(w.color);
    setError(null);
  }

  async function commitEdit() {
    if (!editingId || !editName.trim()) return;
    try {
      await update(editingId, editName, editColor);
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar o workspace.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {showTitle && <h2 className="text-base font-semibold text-gray-100">Workspaces</h2>}

      <p className="text-xs text-gray-500 leading-relaxed">
        Cada workspace tem seus próprios projetos, categorias, tarefas, planejadas e perfis de
        exportação. As integrações continuam enxergando todos.
      </p>

      {/* Criação */}
      <div className="flex flex-col gap-2 px-3 py-2.5 border border-dashed border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
        <div className="flex items-center gap-2">
          <WorkspaceDot color={previewColor} size={10} />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void handleAdd()}
            placeholder="Adicionar novo workspace (Enter para salvar)"
            className="flex-1 text-sm bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!newName.trim()}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-800 border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg disabled:opacity-40 transition-colors"
          >
            <Plus size={13} />
            Criar
          </button>
        </div>
        <ColorPicker value={previewColor} onChange={setNewColor} />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex flex-col gap-1.5">
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId;
          const isEditing = editingId === w.id;

          return (
            <div
              key={w.id}
              className={`flex flex-col gap-2 px-3 py-2 rounded-lg border transition-colors ${
                isActive ? workspaceClasses(w.color).soft : "bg-gray-900 border-gray-800"
              }`}
            >
              <div className="flex items-center gap-2">
                <WorkspaceDot color={isEditing ? editColor : w.color} size={10} />

                {isEditing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 text-sm bg-gray-800 border border-blue-500 rounded-lg px-2 py-0.5 text-gray-100 focus:outline-none"
                  />
                ) : (
                  <span className="flex-1 text-sm text-gray-200 truncate">{w.name}</span>
                )}

                {!isEditing &&
                  (isActive ? (
                    <span className="text-[10px] uppercase tracking-wide text-gray-500">ativo</span>
                  ) : (
                    <button
                      onClick={() => void request(w.id)}
                      className="text-[10px] uppercase tracking-wide text-gray-500 hover:text-blue-400 transition-colors"
                    >
                      tornar ativo
                    </button>
                  ))}

                {isEditing ? (
                  <>
                    <button
                      onClick={() => void commitEdit()}
                      title="Salvar"
                      className="p-1 text-green-400 hover:text-green-300 rounded-lg"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      title="Cancelar"
                      className="p-1 text-gray-500 hover:text-gray-300 rounded-lg"
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => startEdit(w)}
                      title="Editar"
                      className="p-1 text-gray-500 hover:text-gray-200 rounded-lg"
                    >
                      <Pen size={13} />
                    </button>
                    <button
                      onClick={() => setDeleting(w)}
                      disabled={workspaces.length <= 1}
                      title={
                        workspaces.length <= 1
                          ? "Não é possível excluir o último workspace"
                          : "Excluir"
                      }
                      className="p-1 text-gray-500 hover:text-red-400 rounded-lg disabled:opacity-30 disabled:hover:text-gray-500"
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>

              {isEditing && <ColorPicker value={editColor} onChange={setEditColor} />}
            </div>
          );
        })}
      </div>

      {pending && (
        <div className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5">
          <p className="text-xs text-gray-300 leading-snug">
            Há uma tarefa em execução. Parar e trocar para{" "}
            <span className="text-gray-100 font-medium">{pending.name}</span>?
          </p>
          <span className="text-[10px] text-gray-500">Marcar a tarefa como:</span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => void confirm(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors"
            >
              <CheckCircle2 size={12} />
              Concluída
            </button>
            <button
              onClick={() => void confirm(false)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg transition-colors"
            >
              <Clock size={12} />
              Pendente
            </button>
            <button
              onClick={cancel}
              className="ml-auto p-1 text-gray-600 hover:text-gray-400 rounded-lg"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {deleting && (
        <DeleteWorkspaceModal
          workspace={deleting}
          others={workspaces.filter((w) => w.id !== deleting.id)}
          onConfirm={(target) => remove(deleting.id, target)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
