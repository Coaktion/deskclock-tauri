import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { emit } from "@tauri-apps/api/event";
import type { Category } from "@domain/entities/Category";
import type { CustomField, CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { createPlannedTask } from "@domain/usecases/plannedTasks/CreatePlannedTask";
import { resolveSharedPayload } from "@domain/utils/resolveSharedPayload";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import {
  BillableChip,
  Button,
  DatePickerInput,
  Field,
  Input,
  Modal,
} from "@presentation/components/ui";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import { useRunningTask } from "@presentation/hooks/useRunningTask";
import { useActiveWorkspaceId } from "@presentation/contexts/WorkspaceContext";
import { useCategories } from "@presentation/hooks/useCategories";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useProjects } from "@presentation/hooks/useProjects";
import { OVERLAY_EVENTS } from "@shared/types/overlayEvents";
import type { UUID } from "@shared/types";
import type { SharedTaskPayload } from "@shared/utils/shareLink";
import { todayISO } from "@shared/utils/time";

interface ShareTaskModalProps {
  payload: SharedTaskPayload;
  onClose: () => void;
}

const TITLE = "Tarefa recebida por link";

/**
 * A chegada de um `deskclock://task/share`: o que veio no link, resolvido contra
 * os catálogos **deste** app e aberto para revisão antes de qualquer gravação.
 *
 * Tudo é editável porque nada do link é confiável como dado local — nome de
 * projeto, de categoria e rótulo de campo são de outra máquina, e o que não
 * casou aparece como aviso ao lado do campo vazio, nunca sumindo calado. A data
 * nasce em hoje: o contrato do deeplink não a carrega de propósito (uma tarefa
 * compartilhada na terça não é uma tarefa de terça).
 *
 * **O Enter não submete**, e é um dos casos de exceção da §7 do CLAUDE.md: as
 * duas ações são igualmente primárias, e a tecla teria de escolher uma delas por
 * conta. O ESC fecha, pela casca `Modal`.
 */
export function ShareTaskModal({ payload, onClose }: ShareTaskModalProps) {
  const { projects, loading: projectsLoading } = useProjects();
  const { categories, loading: categoriesLoading } = useCategories();
  const { activeFields, loading: fieldsLoading } = useCustomFields();

  // O formulário nasce do que os catálogos resolvem, e por isso só monta depois
  // deles: montado antes, ele abriria com projeto e categoria vazios e os
  // preencheria sozinho um quadro depois, por cima do que já tivesse sido
  // digitado.
  if (projectsLoading || categoriesLoading || fieldsLoading) {
    return (
      <Modal title={TITLE} size="lg" onClose={onClose}>
        <p className="text-body text-fg-muted">Lendo os cadastros deste workspace…</p>
      </Modal>
    );
  }

  return (
    <ShareTaskForm
      payload={payload}
      projects={projects}
      categories={categories}
      customFields={activeFields}
      onClose={onClose}
    />
  );
}

interface ShareTaskFormProps {
  payload: SharedTaskPayload;
  projects: Project[];
  categories: Category[];
  customFields: CustomField[];
  onClose: () => void;
}

type Pending = "start" | "plan" | null;

function ShareTaskForm({
  payload,
  projects,
  categories,
  customFields,
  onClose,
}: ShareTaskFormProps) {
  // Resolvido uma vez: relê-lo a cada render devolveria o valor do link por cima
  // da edição em curso.
  const [resolved] = useState(() =>
    resolveSharedPayload(payload, projects, categories, customFields)
  );

  const [name, setName] = useState(resolved.name);
  const [projectId, setProjectId] = useState<UUID | null>(resolved.projectId);
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === resolved.projectId)?.name ?? ""
  );
  const [categoryId, setCategoryId] = useState<UUID | null>(resolved.categoryId);
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === resolved.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(resolved.billable);
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState(resolved.startTime);
  const [endTime, setEndTime] = useState(resolved.endTime);
  const [customValues, setCustomValues] = useState<CustomValues>(resolved.customValues);
  const [pending, setPending] = useState<Pending>(null);

  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, projectId);

  const { plannedTaskRepo } = useRepositories();
  const workspaceId = useActiveWorkspaceId();
  const { runningTask, startTask, switchToTask } = useRunningTask();

  function selectProject(option: { id: string; name: string }) {
    setProjectId(option.id);
    setProjectName(option.name);
    // Trocar o projeto zera a categoria (§6.4): o recorte mudou.
    setCategoryId(null);
    setCategoryName("");
  }

  /** Trocar de categoria arrasta o billable padrão dela (§6.2). */
  function selectCategory(option: { id: string; name: string }) {
    setCategoryId(option.id);
    setCategoryName(option.name);
    const category = categories.find((c) => c.id === option.id);
    if (category) setBillable(category.defaultBillable);
  }

  /** O que as duas ações gravam — o **formulário**, nunca o payload do link. */
  function formValues() {
    return {
      name: name.trim() || resolved.name,
      projectId,
      categoryId,
      billable,
      customValues,
    };
  }

  async function handleStart() {
    setPending("start");
    try {
      const input = formValues();
      // `startTask` é no-op com tarefa ativa (§6.1). Trocar aqui é intencional,
      // e é exatamente o que o aviso acima das ações diz que vai acontecer.
      if (runningTask) await switchToTask(input);
      else await startTask(input);
      onClose();
    } finally {
      setPending(null);
    }
  }

  async function handlePlan() {
    setPending("plan");
    try {
      await createPlannedTask(
        plannedTaskRepo,
        {
          workspaceId,
          ...formValues(),
          scheduleType: "specific_date",
          scheduleDate: date,
          startTime: startTime || undefined,
          endTime: endTime || undefined,
        },
        new Date().toISOString()
      );
      await emit(OVERLAY_EVENTS.PLANNED_TASKS_CHANGED, {});
      onClose();
    } finally {
      setPending(null);
    }
  }

  const runningName = runningTask?.name?.trim() || "(sem nome)";
  const runningState = runningTask?.status === "paused" ? "pausada" : "em execução";
  const busy = pending !== null;

  return (
    <Modal
      title={TITLE}
      description="Os dados abaixo vieram de um link compartilhado. Nada foi gravado ainda — revise antes de escolher o que fazer."
      size="lg"
      onClose={onClose}
      bodyClassName="p-5 flex flex-col gap-4"
      notice={
        runningTask ? (
          <div className="flex items-start gap-2 px-3 py-2 bg-warning/10 border border-warning/20 rounded-control">
            <AlertTriangle size={14} className="text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              Iniciar agora encerra a tarefa {runningState} &ldquo;{runningName}&rdquo; e a salva
              como concluída.
            </p>
          </div>
        ) : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handlePlan()}
            loading={pending === "plan"}
            disabled={busy}
          >
            Adicionar como planejada
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleStart()}
            loading={pending === "start"}
            disabled={busy}
          >
            Iniciar agora
          </Button>
        </>
      }
    >
      <Field label="Nome" htmlFor="share-name">
        <Input
          id="share-name"
          autoFocus
          variant="bare"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da tarefa"
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <Field label="Projeto" htmlFor="share-project">
            <Autocomplete
              id="share-project"
              value={projectName}
              onChange={setProjectName}
              onSelect={selectProject}
              options={projects}
              placeholder="Buscar projeto…"
              variant="bare"
            />
          </Field>
          {resolved.unresolved.projects.map((missing) => (
            <p key={missing} className="text-xs text-warning">
              O link trouxe o projeto &ldquo;{missing}&rdquo;, que não existe neste workspace.
            </p>
          ))}
        </div>

        <div className="flex flex-col gap-1">
          {/* Billable encostado na categoria, como nos demais formulários: é a
              categoria que define o padrão (§6.2). */}
          <Field label="Categoria" htmlFor="share-category" boxClassName="flex items-center pr-2">
            <Autocomplete
              id="share-category"
              value={categoryName}
              onChange={setCategoryName}
              onSelect={selectCategory}
              options={categoryOptions}
              placeholder="Buscar categoria…"
              className="flex-1 min-w-0"
              variant="bare"
            />
            <BillableChip billable={billable} onToggle={() => setBillable((b) => !b)} />
          </Field>
          {resolved.unresolved.categories.map((missing) => (
            <p key={missing} className="text-xs text-warning">
              O link trouxe a categoria &ldquo;{missing}&rdquo;, que não existe neste workspace.
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <CustomFieldInputs
          fields={customFields}
          values={customValues}
          onChange={setCustomValues}
          className="flex flex-col gap-4"
        />
        {resolved.unresolved.customFields.length > 0 && (
          <p className="text-xs text-warning">
            Campos personalizados do link sem correspondência aqui:{" "}
            {resolved.unresolved.customFields.join(", ")}.
          </p>
        )}
      </div>

      <div className="border-t border-border-subtle" />

      {/* A data não viaja no link — nasce em hoje e fica editável. Ela governa
          só a planejada; "Iniciar agora" começa no instante do clique. */}
      <div className="grid grid-cols-3 gap-2">
        <DatePickerInput label="Data" value={date} onChange={setDate} />
        <Field label="Início" htmlFor="share-start">
          <Input
            id="share-start"
            type="time"
            variant="bare"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </Field>
        <Field label="Fim" htmlFor="share-end">
          <Input
            id="share-end"
            type="time"
            variant="bare"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
