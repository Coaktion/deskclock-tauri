import { useState } from "react";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { PlannedTask, PlannedTaskAction, ScheduleType } from "@domain/entities/PlannedTask";
import type { Project } from "@domain/entities/Project";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import type { UUID } from "@shared/types";

export interface EditPlannedTaskInput {
  name?: string;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  scheduleType?: ScheduleType;
  scheduleDate?: string | null;
  recurringDays?: number[] | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  actions?: PlannedTaskAction[];
  customValues?: CustomValues;
}

interface UsePlannedTaskEditorArgs {
  task: PlannedTask;
  projects: Project[];
  categories: Category[];
  onSave: (id: string, input: EditPlannedTaskInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Estado e regras da edição de uma tarefa planejada, sem layout nenhum.
 *
 * Existe porque a mesma edição aparece em dois tamanhos — o modal do
 * planejamento e o painel de 288 px do overlay. Duplicar o formulário faria as
 * duas telas divergirem de campos e de comportamento no primeiro ajuste (§9.4);
 * aqui o que muda entre elas é só a disposição na tela.
 */
export function usePlannedTaskEditor({
  task,
  projects,
  categories,
  onSave,
  onClose,
}: UsePlannedTaskEditorArgs) {
  const [name, setName] = useState(task.name);
  const [projectId, setProjectId] = useState<UUID | null>(task.projectId);
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryId, setCategoryId] = useState<UUID | null>(task.categoryId);
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(task.scheduleType);
  const [scheduleDate, setScheduleDate] = useState(task.scheduleDate ?? "");
  const [recurringDays, setRecurringDays] = useState<number[]>(task.recurringDays ?? []);
  const [periodStart, setPeriodStart] = useState(task.periodStart ?? "");
  const [periodEnd, setPeriodEnd] = useState(task.periodEnd ?? "");
  const [actions, setActions] = useState<PlannedTaskAction[]>(task.actions);
  const [newActionType, setNewActionType] = useState<PlannedTaskAction["type"]>("open_url");
  const [newActionValue, setNewActionValue] = useState("");
  const [customValues, setCustomValues] = useState<CustomValues>(task.customValues);
  const [saving, setSaving] = useState(false);

  const { categoriesFor } = useProjectCategoryMap();
  /**
   * Nasce aqui, e não em cada componente, porque o hook serve dois — o
   * `EditPlannedTaskModal` e o `PlannedTaskEditSheet` do popup (§9.4). Calculado
   * nos dois, um ajuste acertaria só uma das telas.
   */
  const categoryOptions = categoriesFor(categories, projectId);

  function selectProject(option: { id: string; name: string }) {
    setProjectId(option.id);
    setProjectName(option.name);
    // O recorte de categorias mudou: a anterior pode não estar mais na lista.
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

  function toggleDay(day: number) {
    setRecurringDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  }

  function addAction() {
    if (!newActionValue.trim()) return;
    setActions((prev) => [...prev, { type: newActionType, value: newActionValue.trim() }]);
    setNewActionValue("");
  }

  function removeAction(index: number) {
    setActions((prev) => prev.filter((_, i) => i !== index));
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(task.id, {
        name: name.trim() || task.name,
        projectId,
        categoryId,
        billable,
        scheduleType,
        scheduleDate: scheduleType === "specific_date" ? scheduleDate || null : null,
        recurringDays: scheduleType === "recurring" ? recurringDays : null,
        periodStart: scheduleType === "period" ? periodStart || null : null,
        periodEnd: scheduleType === "period" ? periodEnd || null : null,
        actions,
        customValues,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return {
    name,
    setName,
    projectName,
    setProjectName,
    selectProject,
    categoryName,
    setCategoryName,
    selectCategory,
    categoryOptions,
    billable,
    setBillable,
    scheduleType,
    setScheduleType,
    scheduleDate,
    setScheduleDate,
    recurringDays,
    toggleDay,
    periodStart,
    setPeriodStart,
    periodEnd,
    setPeriodEnd,
    actions,
    addAction,
    removeAction,
    newActionType,
    setNewActionType,
    newActionValue,
    setNewActionValue,
    customValues,
    setCustomValues,
    saving,
    save,
  };
}

export type PlannedTaskEditor = ReturnType<typeof usePlannedTaskEditor>;
