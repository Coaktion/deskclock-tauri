import { useEffect, useState } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import type { ZendeskTicket } from "@domain/integrations/ITicketImporter";
import type { ITicketImporter } from "@domain/integrations/ITicketImporter";
import type { IPlannedTaskRepository } from "@domain/repositories/IPlannedTaskRepository";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import { importTickets, type ImportTicketInput } from "@domain/usecases/plannedTasks/ImportTickets";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { DatePickerInput } from "@presentation/components/DatePickerInput";
import { emit } from "@tauri-apps/api/event";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import { todayISO } from "@shared/utils/time";

const STATUS_LABELS: Record<ZendeskTicket["status"], string> = {
  new: "Novo",
  open: "Aberto",
  pending: "Pendente",
  hold: "Em espera",
};

const STATUS_COLORS: Record<ZendeskTicket["status"], string> = {
  new: "bg-blue-500/20 text-blue-300",
  open: "bg-green-500/20 text-green-300",
  pending: "bg-yellow-500/20 text-yellow-300",
  hold: "bg-orange-500/20 text-orange-300",
};

interface TicketEditState {
  name: string;
  projectId: string | null;
  projectName: string;
  categoryId: string | null;
  categoryName: string;
  addOpenUrlAction: boolean;
  scheduleType: "recurring" | "specific_date";
  scheduleDate: string;
  expanded: boolean;
}

function defaultEditState(ticket: ZendeskTicket): TicketEditState {
  return {
    name: `#${ticket.id} - ${ticket.subject}`,
    projectId: null,
    projectName: "",
    categoryId: null,
    categoryName: "",
    addOpenUrlAction: true,
    scheduleType: "recurring",
    scheduleDate: todayISO(),
    expanded: false,
  };
}

/* ── Editor inline por ticket ── */

interface TicketEditorProps {
  state: TicketEditState;
  projects: Project[];
  categories: Category[];
  onChange: (s: TicketEditState) => void;
}

function TicketEditor({ state, projects, categories, onChange }: TicketEditorProps) {
  return (
    <div className="mt-1 mx-4 mb-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <Autocomplete
        value={state.projectName}
        onChange={(v) => onChange({ ...state, projectName: v, projectId: null })}
        onSelect={(o) => onChange({ ...state, projectId: o.id, projectName: o.name })}
        options={projects}
        placeholder="Projeto"
      />
      <Autocomplete
        value={state.categoryName}
        onChange={(v) => onChange({ ...state, categoryName: v, categoryId: null })}
        onSelect={(o) => onChange({ ...state, categoryId: o.id, categoryName: o.name })}
        options={categories}
        placeholder="Categoria"
      />

      {/* Toggle abrir URL */}
      <div className="flex items-center justify-between py-0.5">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          <ExternalLink size={11} />
          Abrir ticket ao iniciar
        </span>
        <button
          onClick={() => onChange({ ...state, addOpenUrlAction: !state.addOpenUrlAction })}
          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
            state.addOpenUrlAction ? "bg-blue-600" : "bg-gray-700"
          }`}
        >
          <span
            className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
              state.addOpenUrlAction ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* Tipo de agendamento */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "recurring" })}
            className={`px-2 py-0.5 text-xs rounded-lg transition-colors ${
              state.scheduleType === "recurring"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Recorrente
          </button>
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-xs rounded-lg transition-colors ${
              state.scheduleType === "specific_date"
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Data específica
          </button>
        </div>
      </div>

      {state.scheduleType === "specific_date" && (
        <DatePickerInput
          value={state.scheduleDate}
          onChange={(v) => onChange({ ...state, scheduleDate: v })}
          placeholder="DD/MM/AAAA"
        />
      )}
    </div>
  );
}

/* ── Linha de ticket ── */

interface TicketRowProps {
  ticket: ZendeskTicket;
  selected: boolean;
  editState: TicketEditState;
  projects: Project[];
  categories: Category[];
  onToggleSelect: () => void;
  onEditChange: (s: TicketEditState) => void;
}

function TicketRow({
  ticket,
  selected,
  editState,
  projects,
  categories,
  onToggleSelect,
  onEditChange,
}: TicketRowProps) {
  return (
    <div
      className="border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800/30 transition-colors"
      onClick={() => onEditChange({ ...editState, expanded: !editState.expanded })}
    >
      <div className="flex items-start gap-2 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 accent-blue-500 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded ${STATUS_COLORS[ticket.status]}`}
            >
              {STATUS_LABELS[ticket.status]}
            </span>
            <input
              type="text"
              value={editState.name}
              onChange={(e) => onEditChange({ ...editState, name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm text-gray-100 bg-transparent outline-none focus:bg-gray-800 focus:px-1 rounded transition-all truncate"
            />
          </div>
          {(editState.projectName || editState.categoryName) && (
            <p className="text-xs text-blue-400 mt-0.5 ml-0.5 truncate">
              {[editState.projectName, editState.categoryName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <span className="p-1 text-gray-600 shrink-0">
          {editState.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
      </div>

      {editState.expanded && (
        <TicketEditor
          state={editState}
          projects={projects}
          categories={categories}
          onChange={onEditChange}
        />
      )}
    </div>
  );
}

/* ── Modal principal ── */

interface ImportZendeskModalProps {
  importer: ITicketImporter;
  repo: IPlannedTaskRepository;
  projects: Project[];
  categories: Category[];
  onImported: (count: number) => void;
  onClose: () => void;
}

export function ImportZendeskModal({
  importer,
  repo,
  projects,
  categories,
  onImported,
  onClose,
}: ImportZendeskModalProps) {
  const [tickets, setTickets] = useState<ZendeskTicket[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editMap, setEditMap] = useState<Map<number, TicketEditState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    importer
      .getTickets()
      .then((tkts) => {
        setTickets(tkts);
        setSelected(new Set(tkts.map((t) => t.id)));
        const map = new Map<number, TicketEditState>();
        tkts.forEach((t) => map.set(t.id, defaultEditState(t)));
        setEditMap(map);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao buscar tickets."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleAll() {
    setSelected(selected.size === tickets.length ? new Set() : new Set(tickets.map((t) => t.id)));
  }

  function toggleTicket(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateEdit(id: number, state: TicketEditState) {
    setEditMap((prev) => new Map(prev).set(id, state));
  }

  async function handleImport() {
    const inputs: ImportTicketInput[] = tickets
      .filter((t) => selected.has(t.id))
      .map((t) => {
        const edit = editMap.get(t.id)!;
        return {
          ticket: t,
          name: edit.name || `#${t.id} - ${t.subject}`,
          projectId: edit.projectId,
          categoryId: edit.categoryId,
          addOpenUrlAction: edit.addOpenUrlAction,
          scheduleType: edit.scheduleType,
          scheduleDate: edit.scheduleType === "specific_date" ? edit.scheduleDate : null,
        };
      });

    if (inputs.length === 0) return;

    setImporting(true);
    try {
      const count = await importTickets(repo, inputs, new Date().toISOString());
      if (count > 0) void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      onImported(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar tickets.");
      setImporting(false);
    }
  }

  const allSelected = tickets.length > 0 && selected.size === tickets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 26 26"
            aria-hidden="true"
          >
            <path
              fill="#03363D"
              d="M12 8.2v14.5H0zM12 3c0 3.3-2.7 6-6 6S0 6.3 0 3h12zm2 19.7c0-3.3 2.7-6 6-6s6 2.7 6 6H14zm0-5.2V3h12z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-100">Importar do Zendesk</h2>
            <p className="text-xs text-gray-500">Tickets atribuídos a você em aberto</p>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-300 rounded-lg">
            <X size={16} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Buscando tickets…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 m-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
              <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {!loading && !error && tickets.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-12">
              Nenhum ticket em aberto encontrado.
            </p>
          )}

          {!loading && !error && tickets.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200"
                >
                  {allSelected ? <CheckSquare size={13} /> : <Square size={13} />}
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  <span className="text-gray-600">({tickets.length})</span>
                </button>
              </div>

              {tickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selected.has(ticket.id)}
                  editState={editMap.get(ticket.id) ?? defaultEditState(ticket)}
                  projects={projects}
                  categories={categories}
                  onToggleSelect={() => toggleTicket(ticket.id)}
                  onEditChange={(s) => updateEdit(ticket.id, s)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && tickets.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-800 shrink-0">
            <button
              onClick={onClose}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg transition-colors"
            >
              {importing ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Importando…
                </>
              ) : (
                <>Importar selecionados ({selected.size})</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
