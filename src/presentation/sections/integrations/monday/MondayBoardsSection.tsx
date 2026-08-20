import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useEffect, useState, type ReactNode } from "react";
import { Input } from "@presentation/components/ui";

/** Rótulo + descrição à esquerda, controle à direita — o arranjo de toda a seção. */
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <span className="text-sm text-fg-secondary">{label}</span>
        {hint && <p className="text-xs text-fg-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

/**
 * Campo de id de board, gravado no blur ou no Enter.
 *
 * Gravar a cada tecla deixaria a config com ids parciais, e o rastreador roda em
 * segundo plano: ele consultaria um board inexistente e registraria o erro
 * enquanto o usuário ainda está digitando.
 */
function BoardIdInput({
  value,
  onSave,
  placeholder,
}: {
  value: string;
  onSave: (id: string) => Promise<void>;
  placeholder: string;
}) {
  const [draft, setDraft] = useState(value);

  // O valor chega depois, quando a config carrega.
  useEffect(() => setDraft(value), [value]);

  function commit() {
    const next = draft.trim();
    if (next === value) return;
    void onSave(next);
  }

  // A largura vai no elemento em volta, nunca no campo: o `Input` é sempre
  // `w-full` e a classe de largura passada a ele morre na ordem do CSS — o
  // campo ficaria com 100% da linha e, como não encolhe, esmagaria o rótulo.
  return (
    <div className="w-36 shrink-0">
      <Input
        size="sm"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        placeholder={placeholder}
        inputMode="numeric"
      />
    </div>
  );
}

/**
 * Os dois boards que descrevem a integração.
 *
 * Substituiu cinco escolhas — workspace do Monday, pasta de clientes, pasta de
 * internos, board interno e o mapeamento manual board ↔ projeto — que
 * descreviam à mão o que o próprio Monday já descreve. Os ids vêm preenchidos
 * com os da conta em que a integração foi desenhada e são trocáveis: outra
 * conta troca os dois e o resto segue igual.
 */
export function MondayBoardsSection() {
  const config = useAppConfig();
  const [portfolioBoardId, setPortfolioBoardId] = useState("");
  const [reportBoardId, setReportBoardId] = useState("");

  useEffect(() => {
    if (!config.isLoaded) return;
    setPortfolioBoardId(config.get("mondayPortfolioBoardId"));
    setReportBoardId(config.get("mondayReportBoardId"));
    // Hidratação única a partir da config já carregada: `config` é recriado a
    // cada render do provider e reverteria o que o usuário acabou de digitar.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSavePortfolio(id: string) {
    setPortfolioBoardId(id);
    await config.set("mondayPortfolioBoardId", id);
  }

  async function handleSaveReport(id: string) {
    setReportBoardId(id);
    await config.set("mondayReportBoardId", id);
  }

  return (
    <div className="border-t border-border-subtle px-4 py-3 space-y-3">
      <SettingRow
        label="Board de Portfólio"
        hint="Lista os projetos. Cada item vira um projeto e diz em qual quadro as horas dele são gravadas."
      >
        <BoardIdInput
          value={portfolioBoardId}
          onSave={handleSavePortfolio}
          placeholder="ID do board"
        />
      </SettingRow>

      <SettingRow
        label="Board de Report de Horas"
        hint="Catálogo dos rótulos. Não recebe apontamento: as horas vão direto ao quadro do projeto."
      >
        <BoardIdInput value={reportBoardId} onSave={handleSaveReport} placeholder="ID do board" />
      </SettingRow>
    </div>
  );
}
