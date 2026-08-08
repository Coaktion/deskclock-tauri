import { useState } from "react";
import { Upload } from "lucide-react";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { Button, Modal, Textarea } from "@presentation/components/ui";

interface BulkImportModalProps {
  title: string;
  placeholder: string;
  onImport: (text: string) => Promise<unknown>;
  onClose: () => void;
}

export function BulkImportModal({ title, placeholder, onImport, onClose }: BulkImportModalProps) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
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
    <Modal
      title={title}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={handleImport}
            disabled={!text.trim()}
            loading={loading}
            icon={<Upload size={14} />}
          >
            {loading ? "Importando..." : "Importar"}
          </Button>
        </>
      }
    >
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={8}
        autoFocus
        className="resize-none"
      />
    </Modal>
  );
}
