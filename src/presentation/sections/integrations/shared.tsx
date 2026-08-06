import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Circle } from "lucide-react";
import { useState } from "react";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useWorkspaces } from "@presentation/contexts/WorkspaceContext";
import type { SyncFeedback } from "@presentation/hooks/useSyncNowButton";
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
 * Escreve direto na config, sem rascunho local: a escolha é um clique único,
 * não um campo que se digita aos poucos.
 */
export function DeskclockWorkspaceRow({
  configKey,
  hint,
  // O padrão é a faixa de card, como a das outras seções de topo. Dentro de uma
  // SubSection o `px-4` já veio do pai, e repeti-lo indentaria a linha duas
  // vezes — daí o wrapper ser do componente, e não do chamador: com um
  // workspace só ele some inteiro, sem deixar uma borda vazia para trás.
  className = "border-t border-gray-800 px-4 py-3",
}: {
  configKey: IntegrationWorkspaceKey;
  hint: string;
  className?: string;
}) {
  const config = useAppConfig();
  const { workspaces } = useWorkspaces();

  if (workspaces.length <= 1) return null;

  const selected = resolveIntegrationWorkspaceId(config.isLoaded ? config.get(configKey) : "");

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-sm text-gray-300">Workspace DeskClock</span>
          <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
        </div>
        <select
          value={selected}
          onChange={(e) => void config.set(configKey, e.target.value)}
          className="shrink-0 bg-gray-800 border border-gray-700 rounded px-2.5 py-1 text-xs text-gray-200 focus:outline-none focus:border-blue-500 max-w-[180px]"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

/**
 * Resultado da última busca manual, abaixo do botão que a disparou. Existe além do
 * toast porque o toast some, e a tela de Integrações é onde se confere se a
 * integração está de pé.
 */
export function SyncFeedbackLine({ feedback }: { feedback: SyncFeedback }) {
  return (
    <p
      className={`flex items-start gap-1.5 mt-2 text-[11px] leading-relaxed ${
        feedback.ok ? "text-green-400" : "text-rose-400"
      }`}
    >
      {feedback.ok ? (
        <CheckCircle2 size={12} className="mt-px shrink-0" />
      ) : (
        <AlertCircle size={12} className="mt-px shrink-0" />
      )}
      {feedback.text}
    </p>
  );
}

export function StatusBadge({ connected, email }: { connected: boolean; email?: string }) {
  return connected ? (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <CheckCircle2 size={12} />
      {email ? `Conectado como ${email}` : "Conectado"}
    </span>
  ) : (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      <Circle size={12} />
      Não configurado
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
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
      className={`flex items-center justify-between py-2.5 border-b border-gray-800 last:border-0 ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      <span className="text-sm text-gray-300">{label}</span>
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
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-gray-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <span className="text-gray-500">{icon}</span>
        <span className="text-sm font-medium text-gray-200">{title}</span>
        {badge}
        <span className="ml-auto text-gray-600">
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
      className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border border-gray-800 bg-gray-900/50 hover:bg-gray-800/40 transition-colors text-left group"
    >
      <div className="shrink-0 w-9 h-9 rounded-lg bg-gray-800/60 flex items-center justify-center">
        {logo}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-100">{name}</div>
        <div className="text-xs text-gray-500 mt-0.5">{description}</div>
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0 mr-1">
        <StatusBadge connected={connected} email={email} />
        {subBadges && subBadges.length > 0 && (
          <div className="flex gap-1.5">
            {subBadges.map((b) => (
              <span
                key={b.label}
                className={`text-[10.5px] px-1.5 py-0.5 rounded border ${
                  b.active
                    ? "bg-green-500/10 border-green-500/20 text-green-400"
                    : "bg-gray-800/50 border-gray-700/50 text-gray-600"
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
        className="text-gray-600 shrink-0 group-hover:text-gray-400 transition-colors"
      />
    </button>
  );
}
