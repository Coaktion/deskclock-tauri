import { useMemo, useState } from "react";
import { Check, CheckCircle2, Clock, Pen, Trash2, X } from "lucide-react";
import type { Workspace } from "@domain/entities/Workspace";
import { WORKSPACE_COLORS } from "@domain/utils/workspaceColor";
import { integrationsBoundToWorkspace } from "@domain/usecases/workspaces/integrationsBoundToWorkspace";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useWorkspaceAdmin } from "@presentation/hooks/useWorkspaceAdmin";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useWorkspaceSwitchGuard } from "@presentation/hooks/useWorkspaceSwitchGuard";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { WorkspaceDot, workspaceClasses } from "@presentation/components/WorkspaceDot";
import { DeleteWorkspaceModal } from "@presentation/modals/DeleteWorkspaceModal";
import { AddRow, Button, IconButton, Input, SectionCard } from "@presentation/components/ui";

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
          } ${value === c ? "ring-2 ring-offset-2 ring-offset-surface ring-fg-secondary scale-105" : "opacity-60 hover:opacity-100"}`}
        >
          {value === c && <Check size={14} className="text-canvas" />}
        </button>
      ))}
    </div>
  );
}

export function WorkspacesPanel() {
  const { workspaces, activeWorkspaceId, create, update, remove } = useWorkspaceAdmin();
  const config = useAppConfig();
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

  const handleAddKeyDown = useSubmitOnEnter(() => void handleAdd());

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
    <SectionCard
      className="min-h-0 flex flex-col"
      bodyClassName="min-h-0 flex flex-col"
      title="Workspaces"
      count={workspaces.length}
      description="Cada workspace tem seus próprios projetos, categorias, tarefas, planejadas e perfis de exportação. Cada integração escolhe em qual deles trabalha."
    >
      <div className="min-h-0 overflow-y-auto divide-y divide-border-subtle">
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId;
          const isEditing = editingId === w.id;

          return (
            <div
              key={w.id}
              // O ativo se diz pelo tom da própria cor, que é cor de entidade — a
              // casca com borda que ele tinha reintroduzia a pílula que a linha
              // deixou de ser.
              className={`flex flex-col gap-2 px-3 py-2.5 transition-colors ${
                isActive ? workspaceClasses(w.color).soft : ""
              }`}
            >
              <div className="flex items-center gap-2.5">
                <WorkspaceDot color={isEditing ? editColor : w.color} size={10} />

                {isEditing ? (
                  <Input
                    variant="plain"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    autoFocus
                    className="flex-1 bg-raised border border-accent rounded-control px-2 py-0.5"
                  />
                ) : (
                  <span className="flex-1 text-sm text-fg truncate">{w.name}</span>
                )}

                {!isEditing &&
                  (isActive ? (
                    <span className="text-overline uppercase text-fg-muted">ativo</span>
                  ) : (
                    <button
                      onClick={() => void request(w.id)}
                      className="text-overline uppercase text-fg-muted hover:text-accent-text transition-colors"
                    >
                      tornar ativo
                    </button>
                  ))}

                <div className="flex gap-0.5 shrink-0">
                  {isEditing ? (
                    <>
                      {/* O ✓ era verde nos quatro editores de linha de Dados, e
                          verde é `billable`: confirmar uma edição é acento. */}
                      <IconButton
                        onClick={() => void commitEdit()}
                        title="Salvar"
                        icon={<Check size={14} />}
                        size="sm"
                      />
                      <IconButton
                        onClick={() => setEditingId(null)}
                        title="Cancelar"
                        icon={<X size={14} />}
                        variant="neutral"
                        size="sm"
                      />
                    </>
                  ) : (
                    <>
                      <IconButton
                        onClick={() => startEdit(w)}
                        title="Editar"
                        icon={<Pen size={14} />}
                        size="sm"
                      />
                      <IconButton
                        onClick={() => setDeleting(w)}
                        disabled={workspaces.length <= 1}
                        title={
                          workspaces.length <= 1
                            ? "Não é possível excluir o último workspace"
                            : "Excluir"
                        }
                        icon={<Trash2 size={14} />}
                        variant="danger"
                        size="sm"
                      />
                    </>
                  )}
                </div>
              </div>

              {isEditing && <ColorPicker value={editColor} onChange={setEditColor} />}
            </div>
          );
        })}
      </div>

      {error && <p className="shrink-0 px-3 py-2 text-xs text-danger">{error}</p>}

      <AddRow
        onKeyDown={handleAddKeyDown}
        className="shrink-0 border-t border-border-subtle"
        extra={<ColorPicker value={previewColor} onChange={setNewColor} />}
      >
        <WorkspaceDot color={previewColor} size={10} />
        <Input
          variant="plain"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Adicionar novo workspace — Enter para salvar"
          className="flex-1"
        />
        <Button onClick={() => void handleAdd()} disabled={!newName.trim()}>
          Criar
        </Button>
      </AddRow>

      {pending && (
        <div className="shrink-0 flex flex-col gap-1.5 px-3 py-2.5 border-t border-paused/40 bg-paused/5">
          <p className="text-sm text-fg-secondary leading-snug">
            Há uma tarefa em execução. Parar e trocar para{" "}
            <span className="text-fg font-medium">{pending.name}</span>?
          </p>
          <span className="text-sm text-fg-muted">Marcar a tarefa como:</span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="accent"
              size="sm"
              onClick={() => void confirm(true)}
              icon={<CheckCircle2 size={14} />}
            >
              Concluída
            </Button>
            <Button size="sm" onClick={() => void confirm(false)} icon={<Clock size={14} />}>
              Pendente
            </Button>
            <IconButton
              onClick={cancel}
              title="Cancelar a troca de workspace"
              icon={<X size={14} />}
              variant="neutral"
              size="sm"
              className="ml-auto"
            />
          </div>
        </div>
      )}

      {deleting && (
        <DeleteWorkspaceModal
          workspace={deleting}
          others={workspaces.filter((w) => w.id !== deleting.id)}
          boundIntegrations={integrationsBoundToWorkspace(config, deleting.id)}
          onConfirm={(target) => remove(deleting.id, target)}
          onClose={() => setDeleting(null)}
        />
      )}
    </SectionCard>
  );
}
