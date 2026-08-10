import { useState } from "react";
import { Plus } from "lucide-react";
import type { CustomFieldType } from "@domain/entities/CustomField";
import type { UseCustomFieldsResult } from "@presentation/hooks/useCustomFields";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { CustomFieldCard } from "./CustomFieldCard";
import { Input, SectionCard, Select, Textarea } from "@presentation/components/ui";

interface CustomFieldsPanelProps {
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseCustomFieldsResult;
}

const TYPES: [CustomFieldType, string][] = [
  ["text", "Texto"],
  ["multiline", "Texto longo"],
  ["select", "Seleção"],
  ["checkbox", "Caixa"],
];

export function CustomFieldsPanel({ data }: CustomFieldsPanelProps) {
  const { fields, loading, createField, updateField, deleteField } = data;
  const [label, setLabel] = useState("");
  const [type, setType] = useState<CustomFieldType>("text");
  const [optionsText, setOptionsText] = useState("");

  async function handleAdd() {
    if (!label.trim()) return;
    try {
      await createField({
        label,
        type,
        optionLabels: type === "select" ? optionsText.split("\n") : undefined,
      });
      setLabel("");
      setOptionsText("");
    } catch {
      // duplicata, nome vazio ou select sem opção — silencia, como nos demais painéis
    }
  }

  /**
   * Campo de seleção sem nenhuma opção digitada não é criável, e antes disso o
   * Enter no rótulo simplesmente não fazia nada. A regra virou a condição do
   * submit: com as opções preenchidas, o Enter no rótulo cria — e no textarea
   * das opções, Ctrl/Cmd+Enter, porque ali o Enter é quebra de linha.
   */
  const handleAddKeyDown = useSubmitOnEnter(() => void handleAdd(), {
    disabled: type === "select" && !optionsText.trim(),
  });

  return (
    <SectionCard
      title="Campos personalizados"
      description="Valem para todos os workspaces e entram no agrupamento de tarefas: duas tarefas iguais com valores diferentes contam como registros separados."
      bodyClassName="p-3 flex flex-col gap-3"
    >
      <div
        onKeyDown={handleAddKeyDown}
        className="flex flex-col gap-2 px-3 py-2 border border-dashed border-border rounded-control hover:border-fg-muted transition-colors"
      >
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-fg-muted shrink-0" />
          <Input
            variant="plain"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Adicionar novo campo (Enter para salvar)"
            className="flex-1"
          />
          <Select
            aria-label="Tipo do campo"
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
            title="Tipo do campo"
            className="shrink-0"
          >
            {TYPES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </Select>
        </div>
        {type === "select" && (
          <div className="flex items-end gap-2">
            <Textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              placeholder="Uma opção por linha"
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="px-3 py-1.5 text-sm font-medium text-accent-text bg-accent/10 border border-accent/30 hover:bg-accent/20 hover:border-accent/50 rounded-control transition-colors shrink-0"
            >
              Adicionar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        {loading ? (
          <p className="text-sm text-fg-muted py-4 text-center">Carregando...</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-fg-muted py-4 text-center">Nenhum campo cadastrado.</p>
        ) : (
          fields.map((field) => (
            <CustomFieldCard
              key={field.id}
              field={field}
              onUpdate={updateField}
              onDelete={deleteField}
            />
          ))
        )}
      </div>
    </SectionCard>
  );
}
