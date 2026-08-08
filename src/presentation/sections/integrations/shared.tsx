import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import type { SyncFeedback } from "@presentation/hooks/useSyncNowButton";
import { Select } from "@presentation/components/ui";
import type { IntegrationWorkspaceKey } from "@shared/types/appConfig";

/* ── helpers ── */

/**
 * Workspace do DeskClock em que a integração trabalha — o topo do escopo que
 * ela governa.
 *
 * É o que faz a integração rodar **independente do workspace aberto na tela**:
 * o destino do import e o recorte do envio saem daqui, não do ativo. Sem ele, a
 * importação nascia onde a pessoa estivesse no instante do ciclo e o envio
 * enxergava todos os workspaces, mandando ao board do cliente hora de trabalho
 * pessoal.
 *
 * **Some com um único workspace**, como toda a UI de workspace (§5.1.1, §5.6) —
 * e é o que torna esta mudança invisível para quem nunca criou um segundo.
 *
 * **O valor selecionado é estado local, e não uma leitura da config.** O cache do
 * `ConfigContext` é um `useRef` e o `set` não dispara render: lendo direto, a
 * escolha só aparecia ao sair e voltar da tela. É a mesma razão pela qual todas
 * as seções vizinhas guardam o valor em `useState`.
 */
export function DeskclockWorkspaceRow({
  configKey,
  hint,
  // O padrão é a faixa de card, como a das outras seções de topo. Dentro de uma
  // SubSection o `px-4` já veio do pai, e repeti-lo indentaria a linha duas
  // vezes — daí o wrapper ser do componente, e não do chamador: com um
  // workspace só ele some inteiro, sem deixar uma borda vazia para trás.
  className = "border-t border-border-subtle px-4 py-3",
}: {
  configKey: IntegrationWorkspaceKey;
  hint: string;
  className?: string;
}) {
  const config = useAppConfig();
  const { workspaces } = useWorkspaces();
  const [selected, setSelected] = useState("");

  // Hidratação a partir da config já carregada. `config` é recriado a cada
  // render do provider e reverteria a escolha recém-feita.
  useEffect(() => {
    if (!config.isLoaded) return;
    setSelected(resolveIntegrationWorkspaceId(config.get(configKey)));
  }, [config.isLoaded, configKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleChange(id: string) {
    setSelected(id);
    await config.set(configKey, id);
  }

  if (workspaces.length <= 1) return null;

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm text-fg-secondary">Workspace DeskClock</span>
          <p className="text-xs text-fg-muted mt-0.5">{hint}</p>
        </div>
        <Select
          aria-label="Workspace DeskClock"
          size="sm"
          value={selected}
          onChange={(e) => void handleChange(e.target.value)}
          className="shrink-0 max-w-[180px]"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

/**
 * Resultado da última busca manual, abaixo do botão que a disparou. Existe além do
 * toast porque o toast some, e a tela de Integrações é onde se confere se a
 * integração está de pé.
 *
 * **A causa técnica fica no tooltip do ícone**, quando existe. Ela é útil só para
 * quem foi investigar — "verifique sua internet" é o mesmo texto para DNS, proxy
 * e certificado recusado —, mas na linha ela empurraria para fora da tela a
 * frase que diz o que houve. No ícone, quem não procura não vê.
 */
export function SyncFeedbackLine({ feedback }: { feedback: SyncFeedback }) {
  return (
    <p
      className={`flex items-start gap-1.5 mt-2 text-xs leading-relaxed ${
        feedback.ok ? "text-billable" : "text-danger"
      }`}
    >
      {feedback.ok ? (
        <CheckCircle2 size={14} className="mt-px shrink-0" />
      ) : (
        // O `title` vai no wrapper, não no ícone: em SVG inline o atributo não
        // vira tooltip — o navegador só o reconhece como elemento filho.
        <span
          className={`mt-px shrink-0 ${feedback.detail ? "cursor-help" : ""}`}
          title={feedback.detail}
        >
          <AlertCircle size={14} />
        </span>
      )}
      {feedback.text}
    </p>
  );
}

export function StatusBadge({ connected, email }: { connected: boolean; email?: string }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs text-billable">
      <CheckCircle2 size={14} />
      {email ? `Conectado como ${email}` : "Conectado"}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-fg-muted">
      <Circle size={14} />
      Não configurado
    </span>
  );
}

export function Row({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2.5 border-b border-border-subtle last:border-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <span className="text-sm text-fg-secondary">{label}</span>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function SubSection({
  icon,
  title,
  children,
  defaultOpen = false,
  badge,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  /**
   * Disparado ao **abrir**, nunca ao fechar — é o gancho da seção que só busca
   * dados quando alguém olha para ela. Sem ele, a de Mapeamentos do Clockify
   * reimplementava este cabeçalho inteiro à mão, caractere por caractere, só
   * para poder disparar as duas buscas.
   */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen?.();
        }}
        aria-expanded={open}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-raised transition-colors"
      >
        <span className="text-fg-muted">{icon}</span>
        <span className="text-sm font-medium text-fg">{title}</span>
        {badge}
        <span className="ml-auto text-fg-muted">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </button>
      {open && <div className="px-4 pb-2">{children}</div>}
    </div>
  );
}

export interface IntegrationTileProps {
  logo: React.ReactNode;
  name: string;
  description: string;
  connected: boolean;
  email?: string;
  subBadges?: { label: string; active: boolean }[];
  onClick: () => void;
}

export function IntegrationTile({
  logo,
  name,
  description,
  connected,
  email,
  subBadges,
  onClick,
}: IntegrationTileProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-card border border-border-subtle bg-surface hover:bg-raised transition-colors text-left group"
    >
      <div className="shrink-0 w-9 h-9 rounded-control bg-raised flex items-center justify-center">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-fg">{name}</div>
        <div className="text-xs text-fg-muted mt-0.5">{description}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0 mr-1">
        <StatusBadge connected={connected} email={email} />
        {subBadges && subBadges.length > 0 && (
          <div className="flex gap-1.5">
            {subBadges.map((b) => (
              <span
                key={b.label}
                className={`text-xs px-1.5 py-0.5 rounded-chip border ${
                  b.active
                    ? "bg-billable/10 border-billable/20 text-billable"
                    : "bg-raised border-border text-fg-muted"
                }`}
              >
                {b.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <ChevronRight
        size={14}
        className="text-fg-muted shrink-0 group-hover:text-fg-secondary transition-colors"
      />
    </button>
  );
}
