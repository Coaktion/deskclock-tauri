import { useState } from "react";
import { Plus } from "lucide-react";
import type { CustomFieldType } from "@domain/entities/CustomField";
import type { UseCustomFieldsResult } from "@presentation/hooks/useCustomFields";
import { CustomFieldCard } from "./CustomFieldCard";

interface CustomFieldsPanelProps {
  showTitle?: boolean;
  /** Injetado pela página: o contador da aba lê a mesma instância do hook que a lista. */
  data: UseCustomFieldsResult;
}

const TYPES: [CustomFieldType, string][] = [
  ["text", "Texto"],
  ["multiline", "Texto longo"],
  ["select", "Seleção"],
  ["checkbox", "Caixa"],
];

export function CustomFieldsPanel({ showTitle = true, data }: CustomFieldsPanelProps) {
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

  return (
    <div className="flex flex-col gap-3">
      {showTitle && (
        <h2 className="text-base font-semibold text-gray-100">Campos personalizados</h2>
      )}

      <p className="text-xs text-gray-500">
        Campos personalizados valem para todos os workspaces e entram no agrupamento de tarefas:
        duas tarefas iguais com valores diferentes contam como registros separados.
      </p>

      <div className="flex flex-col gap-2 px-3 py-2 border border-dashed border-gray-700 rounded-lg hover:border-gray-600 transition-colors">
        <div className="flex items-center gap-2">
          <Plus size={14} className="text-gray-500 shrink-0" />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && type !== "select") void handleAdd();
            }}
            placeholder="Adicionar novo campo (Enter para salvar)"
            className="flex-1 text-sm bg-transparent text-gray-300 placeholder-gray-600 focus:outline-none"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as CustomFieldType)}
            title="Tipo do campo"
            className="shrink-0 text-sm bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500"
          >
            {TYPES.map(([value, text]) => (
              <option key={value} value={value}>
                {text}
              </option>
            ))}
          </select>
        </div>
        {type === "select" && (
          <div className="flex items-end gap-2">
            <textarea
              value={optionsText}
              onChange={(e) => setOptionsText(e.target.value)}
              rows={3}
              placeholder="Uma opção por linha"
              className="flex-1 text-sm bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-gray-100 placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-y"
            />
            <button
              type="button"
              onClick={() => void handleAdd()}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg shrink-0"
            >
              Adicionar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">Carregando...</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum campo cadastrado.</p>
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
    </div>
  );
}
