import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Workspace } from "@domain/entities/Workspace";
import type { WorkspaceDeletionTarget } from "@domain/usecases/workspaces/DeleteWorkspace";
import type { IntegrationWorkspaceBinding } from "@domain/usecases/workspaces/integrationsBoundToWorkspace";
import { WorkspaceDot } from "@presentation/components/WorkspaceDot";
import { Button, Modal, Select } from "@presentation/components/ui";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

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
    <div className="flex gap-2 rounded-control border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-amber-400" />
      <div className="min-w-0">
        <p className="text-xs text-amber-200 leading-relaxed">
          {bindings.length === 1
            ? "Uma integração trabalha neste workspace e vai parar de funcionar:"
            : `${bindings.length} integrações trabalham neste workspace e vão parar de funcionar:`}
        </p>
        <ul className="mt-1.5 flex flex-col gap-1">
          {bindings.map((b) => (
            <li key={b.key} className="text-xs text-amber-200/80 leading-snug">
              <span className="font-medium text-amber-200">{b.label}</span> {b.consequence}
              {/* A chave está vazia: a tela de Integrações não nomeia este
                  workspace, e sem a ressalva o aviso pareceria engano. */}
              {b.implicit && " — está sem workspace escolhido e usa o Padrão"}
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs text-amber-200/60 leading-snug">
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

  // Enter confirma também aqui, por decisão explícita do usuário — a guarda
  // deste modal continua sendo a escolha obrigatória do destino dos dados, não
  // a dificuldade de acionar o botão.
  const handleKeyDown = useSubmitOnEnter(() => void handleConfirm(), {
    disabled: busy || (mode === "move" && !targetId),
  });

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
    <Modal
      title={
        <>
          <WorkspaceDot color={workspace.color} />
          Excluir {workspace.name}
        </>
      }
      onClose={onClose}
      onKeyDown={handleKeyDown}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          {/* O único botão cheio em `danger` do app — o `!` é o que o faz vencer
              o `bg-accent` do `primary`, que é a mesma caixa. */}
          <Button
            variant="primary"
            className={mode === "delete" ? "bg-danger!" : ""}
            onClick={() => void handleConfirm()}
            disabled={mode === "move" && !targetId}
            loading={busy}
            icon={mode === "delete" ? <AlertTriangle size={14} /> : undefined}
          >
            {busy ? "Excluindo..." : mode === "delete" ? "Excluir com os dados" : "Mover e excluir"}
          </Button>
        </>
      }
    >
      {/* Antes do destino: é a consequência que a escolha de destino não
          resolve — mover os dados não move a integração junto. */}
      {boundIntegrations.length > 0 && <IntegrationsWarning bindings={boundIntegrations} />}

      <p className="text-xs text-fg-secondary leading-relaxed">
        Tarefas, planejadas, projetos, categorias e perfis de exportação deste workspace precisam de
        um destino.
      </p>

      {others.length > 0 && (
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="radio"
            checked={mode === "move"}
            onChange={() => setMode("move")}
            className="mt-1 accent-accent"
          />
          <span className="flex-1">
            <span className="block text-sm text-fg">Mover para outro workspace</span>
            <Select
              aria-label="Workspace de destino"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              onFocus={() => setMode("move")}
              className="mt-1.5 w-full"
            >
              {others.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
            <span className="block mt-1 text-xs text-fg-muted leading-snug">
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
          className="mt-1 accent-danger"
        />
        <span className="flex-1">
          <span className="block text-sm text-fg">Apagar todos os dados</span>
          <span className="block mt-0.5 text-xs text-danger/80 leading-snug">
            Todas as horas registradas neste workspace são perdidas. Não há desfazer.
          </span>
        </span>
      </label>

      {error && <p className="text-xs text-danger">{error}</p>}
    </Modal>
  );
}
