import { useState } from "react";
import { GripVertical } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Field, Input, Select } from "@presentation/components/ui";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { withCustomColumns } from "@domain/utils/exportFormatter";
import type { CustomField } from "@domain/entities/CustomField";
import type {
  ExportProfile,
  ExportFormat,
  CsvSeparator,
  DurationFormat,
  DateFormat,
  ExportColumn,
} from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";

// ─── Sortable column row ─────────────────────────────────────────────────────

interface SortableColumnProps {
  col: ExportColumn;
  idx: number;
  onToggle: (idx: number) => void;
  onRename: (idx: number, label: string) => void;
}

function SortableColumn({ col, idx, onToggle, onRename }: SortableColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.field,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-2 py-1.5 bg-raised rounded-control"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-fg-muted hover:text-fg-secondary cursor-grab active:cursor-grabbing shrink-0"
      >
        <GripVertical size={14} />
      </button>
      <input
        type="checkbox"
        checked={col.visible}
        onChange={() => onToggle(idx)}
        className="accent-accent shrink-0"
      />
      <Input
        variant="plain"
        aria-label={`Rótulo da coluna ${col.field}`}
        value={col.label}
        onChange={(e) => onRename(idx, e.target.value)}
        className="flex-1"
      />
    </div>
  );
}

interface ProfileFormProps {
  initial: Partial<ExportProfile>;
  customFields: CustomField[];
  onSave: (data: Omit<ExportProfile, "id" | "workspaceId">) => void;
  onCancel: () => void;
}

export function ProfileForm({ initial, customFields, onSave, onCancel }: ProfileFormProps) {
  const [name, setName] = useState(initial.name ?? "");
  const [format, setFormat] = useState<ExportFormat>(initial.format ?? "csv");
  const [separator, setSeparator] = useState<CsvSeparator>(initial.separator ?? "comma");
  const [durationFormat, setDurationFormat] = useState<DurationFormat>(
    initial.durationFormat ?? "hh:mm:ss"
  );
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.dateFormat ?? "iso");
  const [isDefault, setIsDefault] = useState(initial.isDefault ?? false);
  const [columns, setColumns] = useState<ExportColumn[]>(
    withCustomColumns(initial.columns ?? [...DEFAULT_COLUMNS], customFields)
  );

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = columns.findIndex((c) => c.field === active.id);
      const newIdx = columns.findIndex((c) => c.field === over.id);
      setColumns(arrayMove(columns, oldIdx, newIdx).map((c, i) => ({ ...c, order: i })));
    }
  }

  function toggleVisible(idx: number) {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, visible: !c.visible } : c)));
  }

  function renameCol(idx: number, label: string) {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, label } : c)));
  }

  const handleKeyDown = useSubmitOnEnter(() =>
    onSave({ name, isDefault, format, separator, durationFormat, dateFormat, columns })
  );

  return (
    <div onKeyDown={handleKeyDown} className="flex flex-col gap-4 h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Nome do perfil" htmlFor="export-profile-name" className="col-span-2">
          <Input
            id="export-profile-name"
            variant="bare"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <Field label="Formato">
          <Select
            aria-label="Formato"
            variant="bare"
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="w-full"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </Select>
        </Field>

        {format === "csv" && (
          <Field label="Separador">
            <Select
              aria-label="Separador"
              variant="bare"
              value={separator}
              onChange={(e) => setSeparator(e.target.value as CsvSeparator)}
              className="w-full"
            >
              <option value="comma">Vírgula</option>
              <option value="semicolon">Ponto-e-vírgula</option>
            </Select>
          </Field>
        )}

        <Field label="Duração">
          <Select
            aria-label="Duração"
            variant="bare"
            value={durationFormat}
            onChange={(e) => setDurationFormat(e.target.value as DurationFormat)}
            className="w-full"
          >
            <option value="hh:mm:ss">HH:MM:SS</option>
            <option value="decimal">Decimal (horas)</option>
            <option value="minutes">Minutos</option>
          </Select>
        </Field>

        <Field label="Formato de data">
          <Select
            aria-label="Formato de data"
            variant="bare"
            value={dateFormat}
            onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            className="w-full"
          >
            <option value="iso">ISO (AAAA-MM-DD)</option>
            <option value="dd/mm/yyyy">DD/MM/AAAA</option>
          </Select>
        </Field>

        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-fg-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="accent-accent"
            />
            Definir como padrão
          </label>
        </div>
      </div>

      {/* Colunas */}
      <div>
        <p className="text-sm text-fg-secondary mb-2">
          Colunas <span className="text-fg-muted">(arraste para reordenar)</span>
        </p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={columns.map((c) => c.field)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-1">
              {columns.map((col, idx) => (
                <SortableColumn
                  key={col.field}
                  col={col}
                  idx={idx}
                  onToggle={toggleVisible}
                  onRename={renameCol}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          variant="primary"
          onClick={() =>
            onSave({ name, isDefault, format, separator, durationFormat, dateFormat, columns })
          }
          disabled={!name.trim()}
        >
          Salvar perfil
        </Button>
      </div>
    </div>
  );
}
