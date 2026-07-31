import { useState } from "react";
import { Check, Pen, Plus, Trash2, X } from "lucide-react";
import type { Workspace } from "@domain/entities/Workspace";
import { WORKSPACE_COLORS, workspaceColorFor } from "@domain/utils/workspaceColor";
import { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";
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

  const [newName, setNewName] = useState("");
  // Enquanto o usuário digita, a cor acompanha o hash do nome — mas uma escolha
  // manual congela o valor, senão a seleção seria desfeita a cada tecla.
  const [newColor, setNewColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const [deleting, setDeleting] = useState<Workspace | null>(null);

  const previewColor = newColor ?? workspaceColorFor(newName || "Novo workspace");

  async function handleAdd() {
    if (!newName.trim()) return;
    setError(null);
    try {
      await create(newName, newColor ?? undefined);
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

                {isActive && !isEditing && (
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">ativo</span>
                )}

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
