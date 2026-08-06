import { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { Workspace } from "@domain/entities/Workspace";
import type { WorkspaceDeletionTarget } from "@domain/usecases/workspaces/DeleteWorkspace";
import type { IntegrationWorkspaceBinding } from "@domain/usecases/workspaces/integrationsBoundToWorkspace";
import { WorkspaceDot } from "@presentation/components/WorkspaceDot";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";

interface DeleteWorkspaceModalProps {
  workspace: Workspace;
  others: Workspace[];
  /** Integrações que trabalham neste workspace — vazio esconde o aviso. */
  boundIntegrations: IntegrationWorkspaceBinding[];
  onConfirm: (target: WorkspaceDeletionTarget) => Promise<void>;
  onClose: () => void;
}

/**
 * Integrações que param de funcionar com a exclusão.
 *
 * O dado é o que a tela de Integrações não mostra: excluído o workspace, a chave
 * da integração aponta para um id que não existe mais e ela **para em
 * silêncio** — a busca não devolve nada e não há erro a exibir. Como não há
 * desfazer, o aviso é a única defesa.
 *
 * **Avisa, não impede.** Quem quer excluir mesmo assim segue em frente e depois
 * escolhe outro workspace em Integrações; o que não pode é descobrir a quebra
 * semanas depois, ao notar que as horas pararam de subir.
 */
function IntegrationsWarning({ bindings }: { bindings: IntegrationWorkspaceBinding[] }) {
  return (
    <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs text-amber-200 leading-relaxed">
          {bindings.length === 1
            ? "Uma integração trabalha neste workspace e vai parar de funcionar:"
            : `${bindings.length} integrações trabalham neste workspace e vão parar de funcionar:`}
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {bindings.map((b) => (
            <li key={b.key} className="text-[11px] text-amber-200/80 leading-snug">
              <span className="font-medium text-amber-200">{b.label}</span> {b.consequence}
              {/* A chave está vazia: a tela de Integrações não nomeia este
                  workspace, e sem a ressalva o aviso pareceria engano. */}
              {b.implicit && " — está sem workspace escolhido e usa o Padrão"}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-[11px] text-amber-200/60 leading-snug">
          Para voltar a funcionar, escolha outro workspace em Integrações depois de excluir.
        </p>
      </div>
    </div>
  );
}

/**
 * Exclusão de workspace — **exceção deliberada** à regra de "exclusões sem
 * confirmação" (§1 do CLAUDE.md). Um workspace pode conter meses de horas
 * registradas, e não há desfazer; por isso o destino dos dados é uma escolha
 * explícita em vez de um clique só.
 */
export function DeleteWorkspaceModal({
  workspace,
  others,
  boundIntegrations,
  onConfirm,
  onClose,
}: DeleteWorkspaceModalProps) {
  const [mode, setMode] = useState<"move" | "delete">(others.length > 0 ? "move" : "delete");
  const [targetId, setTargetId] = useState(others[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEscapeToClose(onClose);

  async function handleConfirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(
        mode === "move" ? { mode: "move", toWorkspaceId: targetId } : { mode: "delete" }
      );
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir o workspace.");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-gray-100 flex items-center gap-2">
            <WorkspaceDot color={workspace.color} />
            Excluir {workspace.name}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          {/* Antes do destino: é a consequência que a escolha de destino não
              resolve — mover os dados não move a integração junto. */}
          {boundIntegrations.length > 0 && <IntegrationsWarning bindings={boundIntegrations} />}

          <p className="text-xs text-gray-400 leading-relaxed">
            Tarefas, planejadas, projetos, categorias e perfis de exportação deste workspace
            precisam de um destino.
          </p>

          {others.length > 0 && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                checked={mode === "move"}
                onChange={() => setMode("move")}
                className="mt-1 accent-blue-500"
              />
              <span className="flex-1">
                <span className="block text-sm text-gray-200">Mover para outro workspace</span>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  onFocus={() => setMode("move")}
                  className="mt-1.5 w-full bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {others.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <span className="block mt-1 text-[11px] text-gray-500 leading-snug">
                  Projetos e categorias de mesmo nome no destino são reaproveitados, não duplicados.
                </span>
              </span>
            </label>
          )}

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="radio"
              checked={mode === "delete"}
              onChange={() => setMode("delete")}
              className="mt-1 accent-red-500"
            />
            <span className="flex-1">
              <span className="block text-sm text-gray-200">Apagar todos os dados</span>
              <span className="block mt-0.5 text-[11px] text-red-400/80 leading-snug">
                Todas as horas registradas neste workspace são perdidas. Não há desfazer.
              </span>
            </span>
          </label>

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleConfirm()}
            disabled={busy || (mode === "move" && !targetId)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg text-white transition-colors disabled:opacity-40 ${
              mode === "delete" ? "bg-red-700 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {mode === "delete" && <AlertTriangle size={14} />}
            {busy ? "Excluindo..." : mode === "delete" ? "Excluir com os dados" : "Mover e excluir"}
          </button>
        </div>
      </div>
    </div>
  );
}
