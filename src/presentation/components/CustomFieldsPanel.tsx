import { useState } from "react";
import type { CustomFieldType } from "@domain/entities/CustomField";
import type { UseCustomFieldsResult } from "@presentation/hooks/useCustomFields";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { CustomFieldCard } from "./CustomFieldCard";
import { AddRow, Button, Input, SectionCard, Select, Textarea } from "@presentation/components/ui";

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
      className="min-h-0 flex flex-col"
      bodyClassName="min-h-0 flex flex-col"
      title="Campos personalizados"
      count={fields.length}
      description="Valem para todos os workspaces e entram no agrupamento de tarefas: duas tarefas iguais com valores diferentes contam como registros separados."
    >
      <div className="min-h-0 overflow-y-auto divide-y divide-border-subtle">
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

      <AddRow
        onKeyDown={handleAddKeyDown}
        className="shrink-0 border-t border-border-subtle"
        extra={
          type === "select" && (
            <div className="flex items-end gap-2">
              <Textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                rows={3}
                placeholder="Uma opção por linha"
                className="flex-1"
              />
              <Button variant="accent" onClick={() => void handleAdd()}>
                Adicionar
              </Button>
            </div>
          )
        }
      >
        <Input
          variant="plain"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Adicionar novo campo — Enter para salvar"
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
      </AddRow>
    </SectionCard>
  );
}
