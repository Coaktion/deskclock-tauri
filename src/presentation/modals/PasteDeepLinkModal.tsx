import { useId, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button, Field, Input, Modal } from "@presentation/components/ui";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { readDeepLinkInput } from "@shared/utils/deepLinkInput";

interface PasteDeepLinkModalProps {
  onClose: () => void;
}

/**
 * O segundo caminho de entrada de um `deskclock://`: colar o endereço à mão.
 *
 * Existe porque nem todo lugar linkifica o texto — colado no Slack o link vira
 * clicável e o sistema operacional entrega ao app, mas na descrição de um evento
 * do Google Meet ele fica texto morto. O contorno de encurtador resolve um caso;
 * este campo resolve o resto.
 *
 * **O roteamento continua sendo do Rust.** O que se valida aqui é a forma do
 * texto (`readDeepLinkInput`), para a ação primária não ficar clicável sobre um
 * link que já se sabe inválido; o destino é decidido por `open_deep_link`, o
 * mesmo caminho por onde entra o link clicado fora do app — e é ele quem navega
 * e traz a janela para a frente, então o sucesso só precisa fechar o modal.
 */
export function PasteDeepLinkModal({ onClose }: PasteDeepLinkModalProps) {
  const fieldId = useId();
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  /** O que o Rust recusou — já vem redigido em português de lá. */
  const [failure, setFailure] = useState<string | null>(null);

  const link = readDeepLinkInput(raw);

  async function handleOpen() {
    if (!link.ready || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await invoke("open_deep_link", { url: link.url });
      onClose();
    } catch (e) {
      setFailure(typeof e === "string" ? e : "Não foi possível abrir o link.");
      setBusy(false);
    }
  }

  // Uma ação primária só, então o Enter tem destino óbvio (§7 do CLAUDE.md).
  const handleKeyDown = useSubmitOnEnter(() => void handleOpen(), {
    disabled: !link.ready || busy,
  });

  return (
    <Modal
      title="Receber link"
      description="Cole um link do DeskClock — o endereço começa com deskclock://."
      onClose={onClose}
      onKeyDown={handleKeyDown}
      bodyClassName="p-5 flex flex-col gap-2"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleOpen()}
            disabled={!link.ready}
            loading={busy}
          >
            Abrir
          </Button>
        </>
      }
    >
      <Field label="Link" htmlFor={fieldId}>
        <Input
          id={fieldId}
          autoFocus
          variant="bare"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setFailure(null);
          }}
          placeholder="deskclock://…"
        />
      </Field>

      {link.error && <p className="text-xs text-danger">{link.error}</p>}
      {!link.error && link.sharedName && (
        <p className="text-xs text-fg-muted">Tarefa: {link.sharedName}</p>
      )}
      {failure && <p className="text-xs text-danger">{failure}</p>}
    </Modal>
  );
}
