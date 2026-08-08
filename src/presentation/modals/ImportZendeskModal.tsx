import { useCallback, useEffect, useState } from "react";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
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
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import { todayISO } from "@shared/utils/time";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";

const STATUS_LABELS: Record<ZendeskTicket["status"], string> = {
  new: "Novo",
  open: "Aberto",
  pending: "Pendente",
  hold: "Em espera",
};

const STATUS_COLORS: Record<ZendeskTicket["status"], string> = {
  new: "bg-accent/20 text-accent-text",
  open: "bg-billable/20 text-billable",
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
  /** Recorte de categorias do projeto da linha — ver `useProjectCategoryMap`. */
  categoryOptionsFor: (projectId: string | null) => Category[];
  onChange: (s: TicketEditState) => void;
}

function TicketEditor({ state, projects, categoryOptionsFor, onChange }: TicketEditorProps) {
  return (
    <div className="mt-1 mx-4 mb-2 space-y-1.5" onClick={(e) => e.stopPropagation()}>
      <Autocomplete
        value={state.projectName}
        onChange={(v) => onChange({ ...state, projectName: v, projectId: null })}
        onSelect={(o) =>
          // Projeto novo zera a categoria. Só no `onSelect`: o `onChange` acima
          // dispara a cada tecla digitada.
          onChange({
            ...state,
            projectId: o.id,
            projectName: o.name,
            categoryId: null,
            categoryName: "",
          })
        }
        options={projects}
        placeholder="Projeto"
      />
      <Autocomplete
        value={state.categoryName}
        onChange={(v) => onChange({ ...state, categoryName: v, categoryId: null })}
        onSelect={(o) => onChange({ ...state, categoryId: o.id, categoryName: o.name })}
        options={categoryOptionsFor(state.projectId)}
        placeholder="Categoria"
      />

      {/* Toggle abrir URL */}
      <div className="flex items-center justify-between py-0.5">
        <span className="text-xs text-fg-secondary flex items-center gap-1">
          <ExternalLink size={14} />
          Adicionar automaticamente uma ação de abrir o ticket
        </span>
        <button
          onClick={() => onChange({ ...state, addOpenUrlAction: !state.addOpenUrlAction })}
          className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${
            state.addOpenUrlAction ? "bg-accent" : "bg-border"
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
        <span className="text-xs text-fg-muted shrink-0">Agendamento:</span>
        <div className="flex items-center gap-1 bg-raised rounded-control p-0.5">
          <button
            onClick={() => onChange({ ...state, scheduleType: "recurring" })}
            className={`px-2 py-0.5 text-xs rounded-control transition-colors ${
              state.scheduleType === "recurring"
                ? "bg-accent text-white"
                : "text-fg-secondary hover:text-fg"
            }`}
          >
            Recorrente
          </button>
          <button
            onClick={() => onChange({ ...state, scheduleType: "specific_date" })}
            className={`px-2 py-0.5 text-xs rounded-control transition-colors ${
              state.scheduleType === "specific_date"
                ? "bg-accent text-white"
                : "text-fg-secondary hover:text-fg"
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
  categoryOptionsFor: (projectId: string | null) => Category[];
  onToggleSelect: () => void;
  onEditChange: (s: TicketEditState) => void;
}

function TicketRow({
  ticket,
  selected,
  editState,
  projects,
  categoryOptionsFor,
  onToggleSelect,
  onEditChange,
}: TicketRowProps) {
  return (
    <div
      className="border-b border-border-subtle last:border-0 cursor-pointer hover:bg-raised/30 transition-colors"
      onClick={() => onEditChange({ ...editState, expanded: !editState.expanded })}
    >
      <div className="flex items-start gap-2 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 accent-accent shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-chip ${STATUS_COLORS[ticket.status]}`}
            >
              {STATUS_LABELS[ticket.status]}
            </span>
            <input
              type="text"
              value={editState.name}
              onChange={(e) => onEditChange({ ...editState, name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 text-sm text-fg bg-transparent outline-none focus:bg-raised focus:px-1 rounded-chip transition-all truncate"
              autoComplete="off"
            />
          </div>
          {(editState.projectName || editState.categoryName) && (
            <p className="text-xs text-accent-text mt-0.5 ml-0.5 truncate">
              {[editState.projectName, editState.categoryName].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <span className="p-1 text-fg-muted shrink-0">
          {editState.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
      </div>

      {editState.expanded && (
        <TicketEditor
          state={editState}
          projects={projects}
          categoryOptionsFor={categoryOptionsFor}
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
  // Destino escolhido na integração, não o workspace aberto na tela.
  const config = useAppConfig();
  const workspaceId = resolveIntegrationWorkspaceId(config.get("zendeskDeskclockWorkspaceId"));
  // Uma consulta para o modal inteiro: um hook por linha viraria dezenas.
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptionsFor = useCallback(
    (projectId: string | null) => categoriesFor(categories, projectId),
    [categoriesFor, categories]
  );
  const [tickets, setTickets] = useState<ZendeskTicket[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editMap, setEditMap] = useState<Map<number, TicketEditState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEscapeToClose(onClose);

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
      const count = await importTickets(repo, inputs, new Date().toISOString(), workspaceId);
      if (count > 0) void emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      onImported(count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao importar tickets.");
      setImporting(false);
    }
  }

  const allSelected = tickets.length > 0 && selected.size === tickets.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/80">
      <div className="bg-surface border border-border rounded-card shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border-subtle shrink-0">
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
            <h2 className="text-sm font-semibold text-fg">Importar do Zendesk</h2>
            <p className="text-xs text-fg-muted">Tickets atribuídos a você em aberto</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-fg-muted hover:text-fg-secondary rounded-control"
          >
            <X size={16} />
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-12 text-fg-muted">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Buscando tickets…</span>
            </div>
          )}

          {!loading && error && (
            <div className="flex items-start gap-2 m-4 p-3 bg-danger/10 border border-danger rounded-control">
              <AlertCircle size={14} className="text-danger shrink-0 mt-0.5" />
              <p className="text-xs text-danger">{error}</p>
            </div>
          )}

          {!loading && !error && tickets.length === 0 && (
            <p className="text-sm text-fg-muted text-center py-12">
              Nenhum ticket em aberto encontrado.
            </p>
          )}

          {!loading && !error && tickets.length > 0 && (
            <>
              <div className="flex items-center justify-between px-4 py-2 border-b border-border-subtle">
                <button
                  onClick={toggleAll}
                  className="flex items-center gap-2 text-xs text-fg-secondary hover:text-fg"
                >
                  {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                  {allSelected ? "Desmarcar todos" : "Selecionar todos"}
                  <span className="text-fg-muted">({tickets.length})</span>
                </button>
              </div>

              {tickets.map((ticket) => (
                <TicketRow
                  key={ticket.id}
                  ticket={ticket}
                  selected={selected.has(ticket.id)}
                  editState={editMap.get(ticket.id) ?? defaultEditState(ticket)}
                  projects={projects}
                  categoryOptionsFor={categoryOptionsFor}
                  onToggleSelect={() => toggleTicket(ticket.id)}
                  onEditChange={(s) => updateEdit(ticket.id, s)}
                />
              ))}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && tickets.length > 0 && (
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border-subtle shrink-0">
            <button
              onClick={onClose}
              className="text-xs text-fg-muted hover:text-fg-secondary transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={importing || selected.size === 0}
              className="flex items-center gap-1.5 text-xs bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-control transition"
            >
              {importing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
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
