import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X, Archive, ArchiveRestore } from "lucide-react";
import type { CustomField } from "@domain/entities/CustomField";
import type { UpdateCustomFieldInput } from "@domain/usecases/customFields/UpdateCustomField";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import type { UUID } from "@shared/types";
import { Badge, IconButton, Input, Textarea } from "@presentation/components/ui";

interface CustomFieldCardProps {
  field: CustomField;
  onUpdate: (id: UUID, input: UpdateCustomFieldInput) => Promise<void>;
  onDelete: (id: UUID) => void;
}

const TYPE_LABEL: Record<CustomField["type"], string> = {
  text: "Texto",
  multiline: "Texto longo",
  select: "Seleção",
  checkbox: "Caixa",
};

export function CustomFieldCard({ field, onUpdate, onDelete }: CustomFieldCardProps) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(field.label);
  const [options, setOptions] = useState(field.options.map((o) => o.label).join("\n"));
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() {
    setLabel(field.label);
    setOptions(field.options.map((o) => o.label).join("\n"));
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function confirmEdit() {
    try {
      await onUpdate(field.id, {
        label,
        optionLabels: field.type === "select" ? options.split("\n") : undefined,
      });
      setEditing(false);
    } catch {
      // Nome duplicado ou select sem opção — mantém a edição aberta.
    }
  }

  function cancelEdit() {
    setLabel(field.label);
    setEditing(false);
  }

  // No campo de seleção, o Enter no rótulo não salvava — a lista de opções fica
  // num textarea, onde o Enter é quebra de linha, e não havia atalho nenhum para
  // confirmar. Agora o rótulo salva e o textarea salva com Ctrl/Cmd+Enter.
  const handleKeyDown = useSubmitOnEnter(() => void confirmEdit());

  if (editing) {
    return (
      <div onKeyDown={handleKeyDown} className="flex flex-col gap-2 px-3 py-2.5 bg-raised">
        <div className="flex items-center gap-2.5">
          <Input
            ref={inputRef}
            variant="plain"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelEdit();
            }}
            className="flex-1 bg-raised border border-accent rounded-control px-2 py-0.5"
          />
          <IconButton
            onClick={() => void confirmEdit()}
            title="Salvar"
            icon={<Check size={14} />}
            size="sm"
          />
          <IconButton
            onClick={cancelEdit}
            title="Cancelar"
            icon={<X size={14} />}
            variant="neutral"
            size="sm"
          />
        </div>
        {field.type === "select" && (
          <Textarea
            value={options}
            onChange={(e) => setOptions(e.target.value)}
            rows={3}
            placeholder="Uma opção por linha"
            title="Renomear uma opção preserva o valor já gravado nas tarefas; remover a linha apaga a opção."
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-surface group transition-colors">
      <span className={`flex-1 text-sm truncate ${field.archived ? "text-fg-muted" : "text-fg"}`}>
        {field.label}
      </span>
      <span className="shrink-0 text-xs text-fg-muted">{TYPE_LABEL[field.type]}</span>
      {field.type === "select" && (
        <span className="shrink-0 text-xs font-mono tabular-nums text-fg-muted">
          {field.options.length} opções
        </span>
      )}
      {field.archived && <Badge tone="warning">Arquivado</Badge>}
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <IconButton
          onClick={startEdit}
          title="Editar campo"
          icon={<Pencil size={14} />}
          size="sm"
        />
        <IconButton
          onClick={() => void onUpdate(field.id, { archived: !field.archived })}
          title={
            field.archived
              ? "Reativar campo"
              : "Arquivar: some dos formulários, mas os valores já gravados continuam valendo"
          }
          icon={field.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
          variant="neutral"
          size="sm"
        />
        <IconButton
          onClick={() => onDelete(field.id)}
          title="Excluir campo e todos os valores gravados"
          icon={<Trash2 size={14} />}
          variant="danger"
          size="sm"
        />
      </div>
    </div>
  );
}
