import { useState, useMemo } from "react";
import { X, Download, Copy, Check, Star, Pencil, Trash2, Plus, GripVertical } from "lucide-react";
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
import * as XLSX from "xlsx";
import { useExportProfiles } from "@presentation/hooks/useExportProfiles";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { buildExportRows, toCSV, toJSON } from "@shared/utils/exportFormatter";
import { todayISO, startOfDayISO, endOfDayISO } from "@shared/utils/time";
import { searchTasks } from "@domain/usecases/tasks/SearchTasks";
import { TaskRepository } from "@infra/database/TaskRepository";
import { groupTasks } from "@shared/utils/groupTasks";
import type { ExportProfile, ExportFormat, CsvSeparator, DurationFormat, DateFormat, ExportColumn } from "@domain/entities/ExportProfile";
import { DEFAULT_COLUMNS } from "@domain/entities/ExportProfile";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { Task } from "@domain/entities/Task";

const taskRepo = new TaskRepository();

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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.field });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 px-2 py-1.5 bg-gray-800 rounded">
      <button {...attributes} {...listeners} className="text-gray-600 hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0">
        <GripVertical size={14} />
      </button>
      <input type="checkbox" checked={col.visible} onChange={() => onToggle(idx)} className="accent-blue-500 shrink-0" />
      <input value={col.label} onChange={(e) => onRename(idx, e.target.value)}
        className="flex-1 bg-transparent text-sm text-gray-200 focus:outline-none" />
    </div>
  );
}

// ─── Aba Configurar Perfil ────────────────────────────────────────────────────

interface ProfileFormProps {
  initial: Partial<ExportProfile>;
  onSave: (data: Omit<ExportProfile, "id">) => void;
  onCancel: () => void;
}

function ProfileForm({ initial, onSave, onCancel }: ProfileFormProps) {
  const [name, setName] = useState(initial.name ?? "");
  const [format, setFormat] = useState<ExportFormat>(initial.format ?? "csv");
  const [separator, setSeparator] = useState<CsvSeparator>(initial.separator ?? "comma");
  const [durationFormat, setDurationFormat] = useState<DurationFormat>(initial.durationFormat ?? "hh:mm:ss");
  const [dateFormat, setDateFormat] = useState<DateFormat>(initial.dateFormat ?? "iso");
  const [isDefault, setIsDefault] = useState(initial.isDefault ?? false);
  const [columns, setColumns] = useState<ExportColumn[]>(initial.columns ?? [...DEFAULT_COLUMNS]);

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
    setColumns((prev) => prev.map((c, i) => i === idx ? { ...c, visible: !c.visible } : c));
  }

  function renameCol(idx: number, label: string) {
    setColumns((prev) => prev.map((c, i) => i === idx ? { ...c, label } : c));
  }

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-gray-400 mb-1 block">Nome do perfil</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500" />
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">Formato</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
            <option value="json">JSON</option>
          </select>
        </div>

        {format === "csv" && (
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Separador</label>
            <select value={separator} onChange={(e) => setSeparator(e.target.value as CsvSeparator)}
              className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500">
              <option value="comma">Vírgula</option>
              <option value="semicolon">Ponto-e-vírgula</option>
            </select>
          </div>
        )}

        <div>
          <label className="text-xs text-gray-400 mb-1 block">Duração</label>
          <select value={durationFormat} onChange={(e) => setDurationFormat(e.target.value as DurationFormat)}
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="hh:mm:ss">HH:MM:SS</option>
            <option value="decimal">Decimal (horas)</option>
            <option value="minutes">Minutos</option>
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-400 mb-1 block">Formato de data</label>
          <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value as DateFormat)}
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500">
            <option value="iso">ISO (AAAA-MM-DD)</option>
            <option value="dd/mm/yyyy">DD/MM/AAAA</option>
          </select>
        </div>

        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} className="accent-blue-500" />
            Definir como padrão
          </label>
        </div>
      </div>

      {/* Colunas */}
      <div>
        <p className="text-xs text-gray-400 mb-2">Colunas <span className="text-gray-600">(arraste para reordenar)</span></p>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={columns.map((c) => c.field)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-1">
              {columns.map((col, idx) => (
                <SortableColumn key={col.field} col={col} idx={idx} onToggle={toggleVisible} onRename={renameCol} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200">Cancelar</button>
        <button onClick={() => onSave({ name, isDefault, format, separator, durationFormat, dateFormat, columns })}
          disabled={!name.trim()}
          className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded">
          Salvar perfil
        </button>
      </div>
    </div>
  );
}

// ─── Modal principal ──────────────────────────────────────────────────────────

export function ExportModal({ projects, categories, onClose }: ExportModalProps) {
  const { profiles, create, update, remove, setDefault } = useExportProfiles();
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
    () => profiles.find((p) => p.id === selectedProfileId) ?? profiles.find((p) => p.isDefault) ?? profiles[0],
    [profiles, selectedProfileId]
  );

  async function loadTasks() {
    const start = periodMode === "today" ? todayISO() : startDate;
    const end = periodMode === "today" ? todayISO() : endDate;
    const result = await searchTasks(taskRepo, { startISO: startOfDayISO(start), endISO: endOfDayISO(end) });
    setTasks(result);
    setSelected(new Set(result.map((t) => t.id)));
    setLoaded(true);
  }

  // Agrupa tarefas selecionadas (mesmo nome + projeto + categoria = um registro)
  const exportTasks = useMemo(() => {
    const sel = tasks.filter((t) => selected.has(t.id));
    const groups = groupTasks(sel);
    return groups.flatMap((g) =>
      g.tasks.length === 1
        ? g.tasks
        : [{ ...g.tasks[0], durationSeconds: g.tasks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0) }]
    );
  }, [tasks, selected]);

  async function saveToFile(bytes: Uint8Array, defaultName: string, ext: string, filterName: string) {
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
      const rows = buildExportRows(exportTasks, activeProfile, projects, categories);

      if (activeProfile.format === "xlsx") {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Tarefas");
        const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
        await saveToFile(new Uint8Array(buf), "export.xlsx", "xlsx", "Excel");
      } else if (activeProfile.format === "json") {
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

  async function handleSaveProfile(data: Omit<ExportProfile, "id">) {
    if (editingProfile) await update(editingProfile.id, data);
    else await create(data);
    setEditingProfile(null);
    setTab("profiles");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg shadow-2xl flex flex-col" style={{ maxHeight: "90vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700 shrink-0">
          <div className="flex gap-1">
            {([["export", "Exportar"], ["profiles", "Perfis"]] as [Tab, string][]).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-sm rounded transition-colors ${tab === t ? "bg-blue-600 text-white" : "text-gray-400 hover:text-gray-200"}`}>
                {label}
              </button>
            ))}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Aba Exportar ── */}
          {tab === "export" && (
            <div className="flex flex-col gap-4">
              {/* Perfil */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Perfil de exportação</label>
                <select value={selectedProfileId} onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-100 focus:outline-none focus:border-blue-500">
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.isDefault ? " (padrão)" : ""}</option>
                  ))}
                </select>
              </div>

              {/* Período */}
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Período</label>
                <div className="flex gap-2 mb-2">
                  {(["today", "custom"] as PeriodMode[]).map((m) => (
                    <button key={m} onClick={() => setPeriodMode(m)}
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${periodMode === m ? "bg-blue-900/40 border-blue-600 text-blue-300" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"}`}>
                      {m === "today" ? "Hoje" : "Personalizado"}
                    </button>
                  ))}
                </div>
                {periodMode === "custom" && (
                  <div className="flex items-center gap-2">
                    <DatePickerInput value={startDate} onChange={setStartDate} className="flex-1" />
                    <span className="text-gray-500 text-sm shrink-0">→</span>
                    <DatePickerInput value={endDate} onChange={setEndDate} className="flex-1" />
                  </div>
                )}
              </div>

              <button onClick={loadTasks}
                className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors">
                Carregar tarefas
              </button>

              {/* Lista de seleção */}
              {loaded && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-gray-400">{selected.size} de {tasks.length} selecionadas</p>
                    <div className="flex gap-2">
                      <button onClick={() => setSelected(new Set(tasks.map((t) => t.id)))}
                        className="text-xs text-blue-400 hover:text-blue-300">Todas</button>
                      <button onClick={() => setSelected(new Set())}
                        className="text-xs text-gray-400 hover:text-gray-200">Nenhuma</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 max-h-40 overflow-y-auto border border-gray-700 rounded p-2">
                    {tasks.length === 0 && <p className="text-xs text-gray-500 text-center py-2">Nenhuma tarefa no período</p>}
                    {tasks.map((t) => {
                      const proj = projects.find((p) => p.id === t.projectId);
                      return (
                        <label key={t.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-800 px-1 py-0.5 rounded">
                          <input type="checkbox" checked={selected.has(t.id)}
                            onChange={() => setSelected((prev) => {
                              const next = new Set(prev);
                              next.has(t.id) ? next.delete(t.id) : next.add(t.id);
                              return next;
                            })} className="accent-blue-500 shrink-0" />
                          <span className="text-xs text-gray-300 truncate">{t.name ?? "(sem nome)"}</span>
                          {proj && <span className="text-xs text-gray-500 truncate">{proj.name}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Ações */}
              {loaded && selected.size > 0 && (
                <div className="flex gap-2 pt-2 border-t border-gray-700">
                  <button onClick={() => void handleExport("file")} disabled={exporting}
                    className="flex-1 flex items-center justify-center gap-2 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors">
                    <Download size={14} /> Salvar arquivo
                  </button>
                  <button onClick={() => void handleExport("clipboard")} disabled={exporting || activeProfile?.format === "xlsx"}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm rounded transition-colors disabled:opacity-50 ${copied ? "bg-green-700 text-green-200" : "bg-gray-700 hover:bg-gray-600 text-gray-200"}`}>
                    {copied ? <><Check size={14} /> Copiado!</> : <><Copy size={14} /> Copiar</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Aba Perfis ── */}
          {tab === "profiles" && (
            <div className="flex flex-col gap-3">
              <button onClick={() => { setEditingProfile(null); setTab("edit-profile"); }}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-200 rounded border border-gray-700 transition-colors w-full justify-center">
                <Plus size={14} /> Novo perfil
              </button>
              {profiles.map((p) => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded border border-gray-700">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-200 truncate">{p.name}</p>
                    <p className="text-xs text-gray-500">{p.format.toUpperCase()}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => void setDefault(p.id)} title="Definir padrão"
                      className={`p-1.5 rounded transition-colors ${p.isDefault ? "text-yellow-400" : "text-gray-500 hover:text-yellow-400"}`}>
                      <Star size={13} fill={p.isDefault ? "currentColor" : "none"} />
                    </button>
                    <button onClick={() => { setEditingProfile(p); setTab("edit-profile"); }}
                      className="p-1.5 text-gray-500 hover:text-blue-400 rounded transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => void remove(p.id)} disabled={profiles.length <= 1}
                      className="p-1.5 text-gray-500 hover:text-red-400 disabled:opacity-30 rounded transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Aba Configurar Perfil ── */}
          {tab === "edit-profile" && (
            <ProfileForm
              initial={editingProfile ?? {}}
              onSave={(data) => void handleSaveProfile(data)}
              onCancel={() => setTab("profiles")}
            />
          )}
        </div>
      </div>

      {/* Toast: arquivo salvo */}
      {savedPath && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2.5 bg-gray-800 border border-gray-600 rounded-lg shadow-xl text-xs text-gray-200 max-w-sm">
          <Check size={13} className="text-green-400 shrink-0" />
          <span className="truncate">Salvo em: {savedPath}</span>
        </div>
      )}
    </div>
  );
}
