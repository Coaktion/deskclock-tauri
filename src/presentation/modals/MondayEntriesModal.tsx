import { useMemo, useState } from "react";
import { DollarSign, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import {
  useMondayEntries,
  type MondayEntry,
  type MondayEntryPatch,
} from "@presentation/hooks/useMondayEntries";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { Badge, Button, FilterPill, IconButton, Modal, Select } from "@presentation/components/ui";
import {
  addDaysISO,
  formatDurationCompact,
  formatHistoryDayHeader,
  startOfMonthISO,
  todayISO,
} from "@shared/utils/time";

/**
 * Só janelas prontas. O personalizado saiu: a busca não é filtrada por data no
 * Monday (§ `useMondayEntries`), então ele não abria nada que as quatro janelas
 * já não cubram — em troca de dois campos de data e de um estado inválido para
 * a tela tratar.
 */
type QuickFilter = "today" | "7days" | "30days" | "month";

const QUICK_LABELS: Record<QuickFilter, string> = {
  today: "Hoje",
  "7days": "7 dias",
  "30days": "30 dias",
  month: "Este mês",
};

function periodLabel(entry: MondayEntry): string {
  if (!entry.period) return "sem data";
  const fmt = (dayISO: string) => {
    const [, m, d] = dayISO.split("-");
    return `${d}/${m}`;
  };
  const { startDayISO, endDayISO } = entry.period;
  return startDayISO === endDayISO ? fmt(startDayISO) : `${fmt(startDayISO)} – ${fmt(endDayISO)}`;
}

interface DayGroup {
  dayISO: string;
  entries: MondayEntry[];
  totalHours: number;
}

/** Agrupa pelo dia de início; um item que cruza dias aparece uma vez, no começo. */
function groupByDay(entries: MondayEntry[]): DayGroup[] {
  const map = new Map<string, MondayEntry[]>();
  for (const entry of entries) {
    const day = entry.period?.startDayISO ?? "";
    map.set(day, [...(map.get(day) ?? []), entry]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayISO, list]) => ({
      dayISO,
      entries: list,
      totalHours: list.reduce((sum, e) => sum + e.hoursDecimal, 0),
    }));
}

export function MondayEntriesModal({ onClose }: { onClose: () => void }) {
  const config = useAppConfig();
  const apiKey = config.get("mondayApiKey");
  const userId = config.get("mondayUserId");

  const [quick, setQuick] = useState<QuickFilter>("7days");


  // Só projeto com quadro de destino: sem ele não há atividade a listar, e o id
  // vazio entraria na consulta que pede os itens de vários boards de uma vez.
  const mappings = useMemo(
    () =>
      normalizeProjectMappings(config.get("mondayProjectMapping")).filter((m) => !!m.mondayBoardId),
    // Relê só quando a config carrega — `config` é recriado a cada render do
    // provider.
    [config.isLoaded] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const range = useMemo(() => {
    const today = todayISO();
    switch (quick) {
      case "today":
        return { start: today, end: today };
      case "7days":
        return { start: addDaysISO(today, -6), end: today };
      case "30days":
        return { start: addDaysISO(today, -29), end: today };
      case "month":
        return { start: startOfMonthISO(), end: today };
    }
  }, [quick]);

  const {
    entries,
    loading,
    deletingId,
    editingId,
    setEditingId,
    refresh,
    handleSaveEdit,
    handleDelete,
  } = useMondayEntries({ mappings, userId, range });

  // Recarregar durante uma exclusão traria de volta o item que acabou de sair da
  // lista — a exclusão no Monday não fica visível na consulta seguinte na hora.
  const busy = loading || deletingId !== null;

  const dayGroups = useMemo(() => groupByDay(entries), [entries]);
  const totalHours = entries.reduce((sum, e) => sum + e.hoursDecimal, 0);

  if (!apiKey || !userId || mappings.length === 0) {
    return (
      <Modal
        title="Atividades no Monday"
        onClose={onClose}
        footer={
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        }
      >
        <p className="text-sm text-fg">
          Conecte o Monday e importe os projetos na tela de Integrações antes de abrir esta janela.
        </p>
      </Modal>
    );
  }

  return (
    // `xl` (900) e `tall`: era janela cheia (`100vw-16px`), a quinta largura de
    // modal do app e o primeiro dos dois véus com desfoque. Numa janela de 1100 px
    // sobram 900 para a tabela — é diálogo, e passa a ler como os outros.
    <Modal
      title="Atividades no Monday"
      description={`Somente as suas, nos ${mappings.length} board(s) vinculados`}
      size="xl"
      tall
      onClose={onClose}
      // Sem padding: cada linha desenha o próprio `px-5` e o cabeçalho do dia é
      // `sticky` — com padding no scrollport ele grudaria deslocado.
      bodyClassName=""
      headerEnd={
        <>
          {entries.length > 0 && (
            <span className="text-xs font-mono tabular-nums text-fg-secondary">
              {formatDurationCompact(Math.round(totalHours * 3600))}
            </span>
          )}
          <IconButton
            icon={<RefreshCw size={14} className={loading ? "animate-spin" : ""} />}
            title="Recarregar"
            variant="neutral"
            size="sm"
            disabled={busy}
            onClick={refresh}
          />
        </>
      }
      toolbar={
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Travados enquanto a busca corre: sem isso dá para pular de janela em
              janela e cada clique reordena a lista sob o cursor. */}
          {(Object.keys(QUICK_LABELS) as QuickFilter[]).map((q) => (
            <FilterPill
              key={q}
              size="sm"
              active={quick === q}
              disabled={busy}
              onClick={() => setQuick(q)}
            >
              {QUICK_LABELS[q]}
            </FilterPill>
          ))}
        </div>
      }
    >
      <>
          {loading && entries.length === 0 && (
            <div className="flex items-center justify-center py-12 text-fg-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}

          {!loading && mappings.length > 0 && dayGroups.length === 0 && (
            <p className="text-center text-fg-muted text-sm py-12">
              Nenhuma atividade sua neste período.
            </p>
          )}

          {dayGroups.map((group) => (
            <div key={group.dayISO}>
              <div className="flex items-center justify-between px-5 py-2.5 bg-surface/60 border-b border-border-subtle sticky top-0 z-10">
                <span className="text-xs font-semibold uppercase tracking-widest text-fg-secondary">
                  {group.dayISO ? formatHistoryDayHeader(group.dayISO) : "Sem data"}
                </span>
                <span className="text-xs font-mono tabular-nums text-fg-muted">
                  {formatDurationCompact(Math.round(group.totalHours * 3600))}
                </span>
              </div>
              {group.entries.map((entry) =>
                editingId === entry.itemId ? (
                  <EntryForm
                    key={entry.itemId}
                    entry={entry}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => handleSaveEdit(entry, patch)}
                  />
                ) : (
                  <EntryRow
                    key={entry.itemId}
                    entry={entry}
                    deleting={deletingId === entry.itemId}
                    onStartEdit={() => setEditingId(entry.itemId)}
                    onDelete={() => handleDelete(entry)}
                  />
                )
              )}
            </div>
          ))}
      </>
    </Modal>
  );
}

interface EntryRowProps {
  entry: MondayEntry;
  deleting: boolean;
  onStartEdit: () => void;
  onDelete: () => Promise<void>;
}

function EntryRow({ entry, deleting, onStartEdit, onDelete }: EntryRowProps) {
  // Confirmação na própria linha, e não em modal: a pergunta é sim/não e o que
  // se apaga precisa continuar à vista enquanto se responde (o modal do
  // workspace existe porque lá há um destino a escolher). Pergunta pendente
  // fixa o bloco de ações — some no hover ele viraria armadilha nova.
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      className={`grid grid-cols-[110px_1fr_auto_auto] items-center gap-3 px-5 py-3 border-b border-border-subtle hover:bg-raised/40 transition-colors group ${
        deleting ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${
            entry.billable ? "bg-billable" : "bg-border"
          }`}
        />
        <span className="text-xs font-mono text-fg-secondary tabular-nums">
          {periodLabel(entry)}
        </span>
      </div>

      <div className="min-w-0">
        <p className="text-sm text-fg truncate">{entry.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className="text-xs text-fg-muted truncate">{entry.boardName}</span>
          {/* A `key` é o campo, não o rótulo: os dois catálogos saem do mesmo
              board de Report e têm rótulos em comum ("Development" é Activity
              Type *e* etapa), então keyar pelo texto colidia sempre que a
              atividade tinha o mesmo valor nos dois. */}
          {(
            [
              ["activityType", entry.activityTypeLabel],
              ["projectStage", entry.projectStageLabel],
            ] as const
          )
            .filter(([, label]) => label.length > 0)
            .map(([field, label]) => (
              <Badge key={field}>{label}</Badge>
            ))}
        </div>
      </div>

      <span className="text-sm font-mono tabular-nums text-fg-secondary shrink-0">
        {formatDurationCompact(Math.round(entry.hoursDecimal * 3600))}
      </span>

      <div
        className={`flex items-center gap-1 transition-opacity shrink-0 ${
          confirming || deleting ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {confirming || deleting ? (
          <>
            <span className="text-xs text-fg-secondary mr-1">Excluir do Monday?</span>
            <button
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="px-2 py-1 text-xs text-fg-secondary hover:text-fg disabled:opacity-50 rounded-control transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => void onDelete()}
              disabled={deleting}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-danger/10 border border-danger text-danger hover:bg-danger/20 disabled:opacity-50 disabled:cursor-not-allowed rounded-control transition-colors"
            >
              {deleting && <Loader2 size={14} className="animate-spin" />}
              Excluir
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onStartEdit}
              className="p-1.5 text-fg-secondary hover:text-accent-text hover:bg-accent/10 rounded-control transition-colors"
              title="Editar no Monday"
            >
              <Pencil size={14} />
            </button>
            <button
              onClick={() => setConfirming(true)}
              className="p-1.5 text-fg-secondary hover:text-danger hover:bg-danger/10 rounded-control transition-colors"
              title="Excluir do Monday"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

interface EntryFormProps {
  entry: MondayEntry;
  onCancel: () => void;
  onSave: (patch: MondayEntryPatch) => Promise<void>;
}

function EntryForm({ entry, onCancel, onSave }: EntryFormProps) {
  const [name, setName] = useState(entry.name);
  const [hours, setHours] = useState(String(entry.hoursDecimal));
  const [billable, setBillable] = useState(entry.billable);
  const [activityType, setActivityType] = useState(entry.activityTypeLabel);
  const [projectStage, setProjectStage] = useState(entry.projectStageLabel);
  const [saving, setSaving] = useState(false);

  const hoursDecimal = Number(hours.replace(",", "."));
  const canSave = name.trim() !== "" && Number.isFinite(hoursDecimal) && hoursDecimal >= 0;

  async function handleSave() {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      await onSave({
        name,
        hoursDecimal,
        billable,
        activityTypeLabel: activityType,
        projectStageLabel: projectStage,
      });
    } finally {
      setSaving(false);
    }
  }

  // O submit desta linha é salvar a própria atividade — não a lista em volta.
  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving || !canSave });

  return (
    <div
      onKeyDown={handleKeyDown}
      className="px-5 py-3 border-b border-border-subtle bg-raised/30 space-y-2"
    >
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome da atividade"
        autoFocus
        autoComplete="off"
        className="w-full px-2.5 py-1.5 text-sm bg-raised border border-border rounded-control text-fg placeholder-fg-muted focus:outline-none focus:border-accent"
      />

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-fg-muted">Horas</label>
        <input
          type="text"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className="w-20 px-2 py-1.5 text-xs bg-raised border border-border rounded-control text-fg tabular-nums focus:outline-none focus:border-accent"
          autoComplete="off"
        />

        <Select
          aria-label="Activity Type"
          size="sm"
          value={activityType}
          onChange={(e) => setActivityType(e.target.value)}
        >
          <option value="">Activity Type…</option>
          {entry.mapping.activityTypeLabels.map((label) => (
            <option key={label} value={label}>
              {label}
            </option>
          ))}
        </Select>

        {entry.mapping.projectStageLabels.length > 0 && (
          <Select
            aria-label="Project Stage"
            size="sm"
            value={projectStage}
            onChange={(e) => setProjectStage(e.target.value)}
          >
            <option value="">Project Stage…</option>
            {entry.mapping.projectStageLabels.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </Select>
        )}

        {/* Só quando o board tem a coluna Billing type. Ela é opcional desde que
            a importação parou de recusar board fora do template, e um botão que
            alterna um valor que nunca sai daqui é armadilha — o mesmo motivo de
            o Project Stage acima ser condicional. */}
        {entry.mapping.columnIds.billingType && (
          <button
            type="button"
            onClick={() => setBillable((b) => !b)}
            title={
              billable ? "Faturável — clique para alternar" : "Não-faturável — clique para alternar"
            }
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-control border transition-colors shrink-0 ${
              billable
                ? "bg-billable/10 border-billable/40 text-billable"
                : "bg-raised border-border text-fg-secondary hover:text-fg"
            }`}
          >
            <DollarSign size={14} />
            {billable ? "Faturável" : "Não-faturável"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs text-fg-secondary hover:text-fg disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className="px-3 py-1.5 text-xs bg-accent hover:opacity-90 text-white rounded-control disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Salvar
          </button>
        </div>
      </div>

      <p className="text-xs text-fg-muted">
        As datas vêm da tarefa no DeskClock e não são editáveis aqui — quem manda nas horas é o
        DeskClock.
      </p>
    </div>
  );
}
