import { Check, Copy } from "lucide-react";
import { Button, SectionCard, SectionRow, SettingLabel } from "@presentation/components/ui";
import { useCopyFeedback } from "@presentation/hooks/useCopyFeedback";
import { buildMcpAddCommand } from "@shared/utils/mcpCommand";
import { showToast } from "@shared/utils/toast";

interface McpConnectCardProps {
  /** A porta em que a API está de fato rodando — o `/mcp` mora nela. */
  port: number;
}

export function McpConnectCard({ port }: McpConnectCardProps) {
  const command = buildMcpAddCommand(port);
  const { copied, copy } = useCopyFeedback();

  async function handleCopy() {
    try {
      await copy(command);
    } catch {
      await showToast("error", "Não foi possível copiar o comando.");
    }
  }

  return (
    <SectionCard title="Conectar ao Claude" divided>
      <SectionRow>
        <SettingLabel
          label="Comando do Claude Code"
          description="Permite que o Claude (ou outro cliente MCP) inicie e pare tarefas, planeje, lance trabalho passado e consulte o histórico. Rode no terminal."
        />
      </SectionRow>
      <SectionRow className="flex items-center gap-3">
        <code className="flex-1 min-w-0 break-all select-all font-mono text-xs text-fg-secondary bg-raised border border-border rounded-chip px-2 py-1">
          {command}
        </code>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void handleCopy()}
          icon={copied ? <Check size={14} /> : <Copy size={14} />}
          className={`shrink-0 ${copied ? "text-success!" : ""}`}
        >
          {copied ? "Copiado!" : "Copiar"}
        </Button>
      </SectionRow>
    </SectionCard>
  );
}
