import { useCallback, useEffect, useState } from "react";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import {
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
import { Button, Input, Modal, SegmentedControl, Toggle } from "@presentation/components/ui";

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
        <Toggle
          checked={state.addOpenUrlAction}
          onChange={(v) => onChange({ ...state, addOpenUrlAction: v })}
          ariaLabel="Adicionar automaticamente uma ação de abrir o ticket"
        />
      </div>

      {/* Tipo de agendamento */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-fg-muted shrink-0">Agendamento:</span>
        <SegmentedControl
          ariaLabel="Tipo de agendamento"
          value={state.scheduleType}
          onChange={(v) => onChange({ ...state, scheduleType: v })}
          options={[
            { value: "recurring", label: "Recorrente" },
            { value: "specific_date", label: "Data específica" },
          ]}
        />
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
            <Input
              variant="plain"
              value={editState.name}
              onChange={(e) => onEditChange({ ...editState, name: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 min-w-0 focus:bg-raised focus:px-1 rounded-chip truncate"
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

  const hasList = !loading && !error && tickets.length > 0;

  return (
    <Modal
      title={
        <>
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
          Importar do Zendesk
        </>
      }
      description="Tickets atribuídos a você em aberto"
      size="lg"
      tall
      onClose={onClose}
      bodyClassName="p-0"
      toolbar={
        hasList ? (
          <Button variant="ghost" onClick={toggleAll}>
            {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
            {allSelected ? "Desmarcar todos" : "Selecionar todos"}
            <span className="text-fg-muted">({tickets.length})</span>
          </Button>
        ) : undefined
      }
      footer={
        hasList ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={selected.size === 0}
              loading={importing}
            >
              {importing ? "Importando…" : `Importar selecionados (${selected.size})`}
            </Button>
          </>
        ) : undefined
      }
    >
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

      {hasList &&
        tickets.map((ticket) => (
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
    </Modal>
  );
}
