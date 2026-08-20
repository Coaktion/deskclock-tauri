import { useState, useMemo } from "react";
import { Download, Copy, Check, Star, Pencil, Trash2, Plus, GripVertical } from "lucide-react";
import { save as tauriSaveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
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
import { useExportProfiles } from "@presentation/hooks/useExportProfiles";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { fieldLabelClass } from "@presentation/components/fieldStyles";
import {
  Button,
  Field,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Select,
} from "@presentation/components/ui";
import { buildExportRows, customColumnField, toCSV, toJSON } from "@domain/utils/exportFormatter";
import type { CustomField } from "@domain/entities/CustomField";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { todayISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { groupTasks } from "@domain/utils/groupTasks";
import type {
  ExportProfile,
  ExportFormat,
  CsvSeparator,
  DurationFormat,
  DateFormat,
  ExportColumn,
} from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { Task } from "@domain/entities/Task";

type Tab = "export" | "profiles" | "edit-profile";
type PeriodMode = "today" | "custom";

interface ExportModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

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

// ─── Aba Configurar Perfil ────────────────────────────────────────────────────

/**
 * Garante uma coluna por campo personalizado ativo. As novas entram
 * **invisíveis**: um campo criado depois do perfil não pode mudar em silêncio o
 * formato de um CSV que alguém já consome.
 */
function withCustomColumns(columns: ExportColumn[], fields: CustomField[]): ExportColumn[] {
  const existing = new Set(columns.map((c) => c.field));
  const missing = fields
    .filter((f) => !existing.has(customColumnField(f.id)))
    .map((f, i) => ({
      field: customColumnField(f.id),
      label: f.label,
      visible: false,
      order: columns.length + i,
    }));
  return [...columns, ...missing];
}

interface ProfileFormProps {
  initial: Partial<ExportProfile>;
  customFields: CustomField[];
  onSave: (data: Omit<ExportProfile, "id" | "workspaceId">) => void;
  onCancel: () => void;
}

function ProfileForm({ initial, customFields, onSave, onCancel }: ProfileFormProps) {
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

// ─── Modal principal ──────────────────────────────────────────────────────────

export function ExportModal({ projects, categories, onClose }: ExportModalProps) {
  const { taskRepo } = useRepositories();
  const { profiles, create, update, remove, setDefault } = useExportProfiles();
  // `fields` (e não `activeFields`) na exportação: um campo arquivado ainda tem
  // valores gravados no histórico e a coluna precisa continuar resolvendo.
  // `loading` importa: `ProfileForm` lê os campos uma única vez, no inicializador
  // do seu state. Montá-lo antes da carga salvaria o perfil sem as colunas custom.
  const { fields: customFields, activeFields, loading: customFieldsLoading } = useCustomFields();

  const [tab, setTab] = useState<Tab>("export");
  const [editingProfile, setEditingProfile] = useState<ExportProfile | null>(null);

  // Aba exportar
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [periodMode, setPeriodMode] = useState<PeriodMode>("today");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const activeProfile = useMemo(
    () =>
      profiles.find((p) => p.id === selectedProfileId) ??
      profiles.find((p) => p.isDefault) ??
      profiles[0],
    [profiles, selectedProfileId]
  );

  async function loadTasks() {
    const start = periodMode === "today" ? todayISO() : startDate;
    const end = periodMode === "today" ? todayISO() : endDate;
    const result = await searchTasks(taskRepo, {
      startISO: startOfDayISO(start),
      endISO: endOfDayISO(end),
    });
    setTasks(result);
    setSelected(new Set(result.map((t) => t.id)));
    setLoaded(true);
  }

  // Agrupa tarefas selecionadas
  // (mesmo nome + projeto + categoria + valores personalizados = um registro)
  const exportTasks = useMemo(() => {
    const sel = tasks.filter((t) => selected.has(t.id));
    const groups = groupTasks(sel);
    return groups.flatMap((g) =>
      g.tasks.length === 1
        ? g.tasks
        : [
            {
              ...g.tasks[0],
              durationSeconds: g.tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0),
            },
          ]
    );
  }, [tasks, selected]);

  async function saveToFile(
    bytes: Uint8Array,
    defaultName: string,
    ext: string,
    filterName: string
  ) {
    const path = await tauriSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: filterName, extensions: [ext] }],
    });
    if (path) {
      await invoke("save_file", { path, content: Array.from(bytes) });
      setSavedPath(path);
      setTimeout(() => setSavedPath(null), 4000);
    }
  }

  async function handleExport(dest: "file" | "clipboard") {
    if (!activeProfile) return;
    setExporting(true);
    try {
      const rows = buildExportRows(exportTasks, activeProfile, projects, categories, customFields);

      if (activeProfile.format === "json") {
        const content = toJSON(rows);
        if (dest === "clipboard") {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          await saveToFile(new TextEncoder().encode(content), "export.json", "json", "JSON");
        }
      } else {
        const content = toCSV(rows, activeProfile.separator);
        if (dest === "clipboard") {
          await navigator.clipboard.writeText(content);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } else {
          await saveToFile(new TextEncoder().encode(content), "export.csv", "csv", "CSV");
        }
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleSaveProfile(data: Omit<ExportProfile, "id" | "workspaceId">) {
    if (editingProfile) await update(editingProfile.id, data);
    else await create(data);
    setEditingProfile(null);
    setTab("profiles");
  }

  return (
    <>
      <Modal
        title="Exportar tarefas"
        size="lg"
        tall
        onClose={onClose}
        // Espaçamento sem arranjo: cada aba desenha o próprio `flex`.
        bodyClassName="p-5"
        toolbar={
          // As abas eram o cabeçalho inteiro, sem título — o design pede título e
          // as abas são recorte de conteúdo, não nome do diálogo.
          <SegmentedControl
            ariaLabel="Seção da exportação"
            value={tab === "edit-profile" ? "profiles" : tab}
            onChange={setTab}
            options={[
              { value: "export", label: "Exportar" },
              { value: "profiles", label: "Perfis" },
            ]}
          />
        }
      >
        {/* ── Aba Exportar ── */}
        {tab === "export" && (
          <div className="flex flex-col gap-4">
            {/* Perfil */}
            <Field label="Perfil de exportação">
              <Select
                aria-label="Perfil de exportação"
                variant="bare"
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="w-full"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isDefault ? " (padrão)" : ""}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Período — o rótulo não veste um campo, e sim um par de botões
                seguido de duas datas: fica como overline solto, na mesma medida
                que o `Field` escreve. */}
            <div>
              <p className={`${fieldLabelClass} mb-1`}>Período</p>
              <div className="flex gap-2 mb-2">
                {(["today", "custom"] as PeriodMode[]).map((m) => (
                  <Button
                    key={m}
                    variant={periodMode === m ? "accent" : "secondary"}
                    onClick={() => setPeriodMode(m)}
                  >
                    {m === "today" ? "Hoje" : "Personalizado"}
                  </Button>
                ))}
              </div>
              {periodMode === "custom" && (
                <div className="flex items-center gap-2">
                  <DatePickerInput value={startDate} onChange={setStartDate} className="flex-1" />
                  <span className="text-fg-muted text-sm shrink-0">→</span>
                  <DatePickerInput value={endDate} onChange={setEndDate} className="flex-1" />
                </div>
              )}
            </div>

            <Button variant="secondary" onClick={loadTasks} className="self-start">
              Carregar tarefas
            </Button>

            {/* Lista de seleção */}
            {loaded && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-fg-secondary">
                    {selected.size} de {tasks.length} selecionadas
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}
                    >
                      Todas
                    </Button>
                    <Button variant="ghost" onClick={() => setSelected(new Set())}>
                      Nenhuma
                    </Button>
                  </div>
                </div>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-border rounded-control p-2">
                  {tasks.length === 0 && (
                    <p className="text-xs text-fg-muted text-center py-2">
                      Nenhuma tarefa no período
                    </p>
                  )}
                  {tasks.map((t) => {
                    const proj = projects.find((p) => p.id === t.projectId);
                    return (
                      <label
                        key={t.id}
                        className="flex items-center gap-2 cursor-pointer hover:bg-raised px-1 py-0.5 rounded-control"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() =>
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(t.id)) next.delete(t.id);
                              else next.add(t.id);
                              return next;
                            })
                          }
                          className="accent-accent shrink-0"
                        />
                        <span className="text-sm text-fg-secondary truncate">
                          {t.name ?? "(sem nome)"}
                        </span>
                        {proj && (
                          <span className="text-xs text-fg-muted truncate">{proj.name}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dois destinos igualmente válidos, e nenhum é a ação principal
                  (§8.2) — por isso ficam no corpo, e não no rodapé. */}
            {loaded && selected.size > 0 && (
              <div className="flex gap-2 pt-2 border-t border-border">
                <Button
                  variant="primary"
                  onClick={() => void handleExport("file")}
                  disabled={exporting}
                  icon={<Download size={14} />}
                  className="flex-1"
                >
                  Salvar arquivo
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleExport("clipboard")}
                  disabled={exporting}
                  icon={copied ? <Check size={14} /> : <Copy size={14} />}
                  className={`flex-1 ${copied ? "text-billable!" : ""}`}
                >
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Aba Perfis ── */}
        {tab === "profiles" && (
          <div className="flex flex-col gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setEditingProfile(null);
                setTab("edit-profile");
              }}
              icon={<Plus size={14} />}
              className="w-full"
            >
              Novo perfil
            </Button>
            {profiles.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 bg-raised rounded-control border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-fg truncate">{p.name}</p>
                  <p className="text-xs text-fg-muted">{p.format.toUpperCase()}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <IconButton
                    icon={<Star size={14} fill={p.isDefault ? "currentColor" : "none"} />}
                    title="Definir padrão"
                    onClick={() => void setDefault(p.id)}
                    className={p.isDefault ? "text-yellow-400" : "hover:text-yellow-400"}
                  />
                  <IconButton
                    icon={<Pencil size={14} />}
                    title="Editar perfil"
                    onClick={() => {
                      setEditingProfile(p);
                      setTab("edit-profile");
                    }}
                  />
                  <IconButton
                    icon={<Trash2 size={14} />}
                    title="Excluir perfil"
                    variant="danger"
                    onClick={() => void remove(p.id)}
                    disabled={profiles.length <= 1}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Aba Configurar Perfil ── */}
        {tab === "edit-profile" && !customFieldsLoading && (
          <ProfileForm
            initial={editingProfile ?? {}}
            customFields={activeFields}
            onSave={(data) => void handleSaveProfile(data)}
            onCancel={() => setTab("profiles")}
          />
        )}
      </Modal>

      {/* Fora do modal: é aviso de janela, não conteúdo do diálogo. */}
      {savedPath && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 bg-raised border border-border rounded-control shadow-xl text-sm text-fg max-w-sm">
          <Check size={14} className="text-billable shrink-0" />
          <span className="truncate">Salvo em: {savedPath}</span>
        </div>
      )}
    </>
  );
}
