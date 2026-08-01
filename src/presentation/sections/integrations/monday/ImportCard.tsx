import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Cartão de um item importável: título, explicação e a ação de trazer/atualizar.
 *
 * Os três blocos da seção de importação repetiam as mesmas classes de borda e de
 * botão. Como já aconteceu com `fieldStyles.ts` (§5.3 do CLAUDE.md), ajustar um
 * e esquecer os outros desalinha a tela em silêncio.
 */
export function ImportCard({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border border-gray-800 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-gray-300">{title}</span>
          <p className="text-[11px] text-gray-500 mt-0.5">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function ImportActionButton({
  label,
  busy = false,
  disabled = false,
  title,
  onClick,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      title={title}
      className="shrink-0 flex items-center gap-1 text-[11px] bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 px-2 py-1 rounded transition-colors"
    >
      {busy && <Loader2 size={10} className="animate-spin" />}
      {label}
    </button>
  );
}
