import { useState } from "react";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import type { Task } from "@domain/entities/Task";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import type { UUID } from "@shared/types";
import { formatTimeOfDay, parseStartTimeInput } from "@shared/utils/time";

export interface EditRunningTaskInput {
  name?: string | null;
  projectId?: UUID | null;
  categoryId?: UUID | null;
  billable?: boolean;
  startTime?: string;
  customValues?: CustomValues;
}

interface UseRunningTaskEditorArgs {
  task: Task;
  projects: Project[];
  categories: Category[];
  onSave: (input: EditRunningTaskInput) => Promise<void>;
  onClose: () => void;
}

/**
 * Estado e regras da edição da tarefa **em execução**, sem layout nenhum — os
 * mesmos atributos que a seção de execução do popup editava em chips inline
 * (nome, projeto, categoria, billable, hora de início e campos personalizados),
 * agora num painel só.
 *
 * Como no `useRunningCustomFields` que ele substitui, os valores são semeados
 * **no mount** e nenhum efeito os ressincroniza: quem monta o hook é o painel,
 * que só existe enquanto está aberto, e a tarefa em execução é justamente a que
 * mais recebe update de fora (pausar, retomar, o tique do timer). Ouvir a tarefa
 * apagaria o que está sendo digitado.
 *
 * Gravar só no "Salvar" é uma escrita e um `RUNNING_TASK_CHANGED` por edição, em
 * vez de um por tecla — a mesma razão de lá.
 */
export function useRunningTaskEditor({
  task,
  projects,
  categories,
  onSave,
  onClose,
}: UseRunningTaskEditorArgs) {
  const [name, setName] = useState(task.name ?? "");
  const [projectId, setProjectId] = useState<UUID | null>(task.projectId);
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === task.projectId)?.name ?? ""
  );
  const [categoryId, setCategoryId] = useState<UUID | null>(task.categoryId);
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === task.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(task.billable);
  const [startTime, setStartTime] = useState(() => formatTimeOfDay(task.startTime));
  const [customValues, setCustomValues] = useState<CustomValues>(task.customValues);
  const [saving, setSaving] = useState(false);

  // Só as opções: o rótulo do chip continua vindo do catálogo cheio, ou
  // desassociar a categoria do projeto apagaria o nome da que a tarefa já usa.
  const { categoriesFor } = useProjectCategoryMap();
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

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      // A hora só entra no payload quando mudou de fato: `startTime` recalcula
      // o cronômetro, e reenviar a mesma hora a cada salvamento faria a tarefa
      // ser reescrita por uma edição que só tocou no nome.
      const parsed = parseStartTimeInput(startTime, task.startTime);
      await onSave({
        name: name.trim() || null,
        projectId,
        categoryId,
        billable,
        customValues,
        ...(parsed && parsed !== task.startTime ? { startTime: parsed } : {}),
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
    startTime,
    setStartTime,
    customValues,
    setCustomValues,
    saving,
    save,
  };
}
