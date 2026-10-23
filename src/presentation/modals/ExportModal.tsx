import { useState, useMemo } from "react";
import { Download, Copy, Check } from "lucide-react";
import { save as tauriSaveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useExportProfiles } from "@presentation/hooks/useExportProfiles";
import { fieldLabelClass } from "@presentation/components/fieldStyles";
import {
  Button,
  DateRangeInput,
  Field,
  Modal,
  SegmentedControl,
  Select,
} from "@presentation/components/ui";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useCopyFeedback } from "@presentation/hooks/useCopyFeedback";
import { todayISO } from "@shared/utils/time";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import {
  generateTaskExport,
  loadTasksForExport,
  mergeTasksForExport,
  resolveExportProfile,
} from "@domain/usecases/exportProfiles/GenerateTaskExport";
import type { ExportProfile } from "@domain/entities/ExportProfile";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { Task } from "@domain/entities/Task";
import { ProfileForm } from "./ExportProfileForm";
import { ExportProfileList } from "./ExportProfileList";
import { ExportTaskSelection } from "./ExportTaskSelection";

type Tab = "export" | "profiles" | "edit-profile";
type PeriodMode = "today" | "custom";

interface ExportModalProps {
  projects: Project[];
  categories: Category[];
  onClose: () => void;
}

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
  const { copied, copy } = useCopyFeedback();
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const activeProfile = useMemo(
    () => resolveExportProfile(profiles, selectedProfileId),
    [profiles, selectedProfileId]
  );

  async function loadTasks() {
    const from = periodMode === "today" ? todayISO() : startDate;
    const to = periodMode === "today" ? todayISO() : endDate;
    // Sem `workspaceId`: o modal sempre buscou em todos os workspaces.
    const result = await loadTasksForExport(taskRepo, { from, to });
    setTasks(result);
    setSelected(new Set(result.map((t) => t.id)));
    setLoaded(true);
  }

  const exportTasks = useMemo(
    () => mergeTasksForExport(tasks.filter((t) => selected.has(t.id))),
    [tasks, selected]
  );

  async function saveToFile(bytes: Uint8Array, defaultName: string, ext: string) {
    const path = await tauriSaveDialog({
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
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
      const result = generateTaskExport(exportTasks, activeProfile, {
        projects,
        categories,
        customFields,
      });
      if (dest === "clipboard") {
        await copy(result.content);
      } else {
        await saveToFile(new TextEncoder().encode(result.content), result.fileName, result.format);
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
              {/* Sem "Hoje" no trilho: o botão de modo logo acima já é ele, e
                  dois controles com o mesmo rótulo lado a lado seriam duas
                  grafias da mesma escolha. */}
              {periodMode === "custom" && (
                <DateRangeInput
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(inicio, fim) => {
                    setStartDate(inicio);
                    setEndDate(fim);
                  }}
                  presets={[
                    "yesterday",
                    "thisWeek",
                    "lastWeek",
                    "thisMonth",
                    "lastMonth",
                    "last30",
                  ]}
                />
              )}
            </div>

            <Button variant="secondary" onClick={loadTasks} className="self-start">
              Carregar tarefas
            </Button>

            {loaded && (
              <ExportTaskSelection
                tasks={tasks}
                projects={projects}
                selected={selected}
                onChange={setSelected}
              />
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
                  className={`flex-1 ${copied ? "text-success!" : ""}`}
                >
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Aba Perfis ── */}
        {tab === "profiles" && (
          <ExportProfileList
            profiles={profiles}
            onNew={() => {
              setEditingProfile(null);
              setTab("edit-profile");
            }}
            onEdit={(p) => {
              setEditingProfile(p);
              setTab("edit-profile");
            }}
            onSetDefault={(id) => void setDefault(id)}
            onRemove={(id) => void remove(id)}
          />
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
