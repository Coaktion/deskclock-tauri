import { useState } from "react";
import { X, Upload } from "lucide-react";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

interface BulkImportModalProps {
  title: string;
  placeholder: string;
  onImport: (text: string) => Promise<unknown>;
  onClose: () => void;
}

export function BulkImportModal({ title, placeholder, onImport, onClose }: BulkImportModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  useEscapeToClose(onClose);
  // O corpo do modal é um textarea — "uma linha por item" é o formato. O Enter
  // quebra linha e Ctrl/Cmd+Enter importa, regra do `useSubmitOnEnter`.
  const handleKeyDown = useSubmitOnEnter(() => void handleImport(), {
    disabled: loading || !text.trim(),
  });

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    await onImport(text);
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
      <div
        onKeyDown={handleKeyDown}
        className="bg-surface border border-border-subtle rounded-card w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <button onClick={onClose} className="text-fg-muted hover:text-fg-secondary">
            <X size={16} />
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={8}
          autoFocus
          className="w-full px-3 py-2 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent resize-none"
        />

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-fg-secondary hover:text-fg">
            Cancelar
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !text.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-control transition"
          >
            <Upload size={14} />
            {loading ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}
