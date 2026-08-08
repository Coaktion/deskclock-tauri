import { useState } from "react";
import { DollarSign } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { Button, Input, Modal } from "@presentation/components/ui";

interface GroupUpdates {
  name: string | null;
  projectId: string | null;
  categoryId: string | null;
  billable: boolean;
  customValues: CustomValues;
}

interface EditGroupModalProps {
  group: TaskGroup;
  projects: Project[];
  categories: Category[];
  onSave: (updates: GroupUpdates) => Promise<void>;
  onClose: () => void;
}

export function EditGroupModal({
  group,
  projects,
  categories,
  onSave,
  onClose,
}: EditGroupModalProps) {
  const first = group.tasks[0];
  const [name, setName] = useState(first.name ?? "");
  const [projectName, setProjectName] = useState(
    projects.find((p) => p.id === first.projectId)?.name ?? ""
  );
  const [categoryName, setCategoryName] = useState(
    categories.find((c) => c.id === first.categoryId)?.name ?? ""
  );
  const [billable, setBillable] = useState(first.billable);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(first.projectId);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(first.categoryId);
  const [saving, setSaving] = useState(false);
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(
    categories,
    projects.find((p) => p.name === projectName)?.id ?? selectedProjectId
  );
  const { activeFields } = useCustomFields();
  // Todas as tarefas do grupo têm os mesmos valores — eles compõem a chave (§6.3).
  const [customValues, setCustomValues] = useState<CustomValues>(first.customValues);

  async function handleSave() {
    if (saving) return;
    const pId = projects.find((p) => p.name === projectName)?.id ?? selectedProjectId ?? null;
    const cId = categories.find((c) => c.name === categoryName)?.id ?? selectedCategoryId ?? null;
    setSaving(true);
    await onSave({
      name: name.trim() || null,
      projectId: pId,
      categoryId: cId,
      billable,
      customValues,
    });
    setSaving(false);
    onClose();
  }

  const handleKeyDown = useSubmitOnEnter(() => void handleSave(), { disabled: saving });

  return (
    <Modal
      title="Editar grupo"
      description={`${group.tasks.length} tarefas serão atualizadas`}
      onClose={onClose}
      onKeyDown={handleKeyDown}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome (opcional)"
        autoFocus
      />

      <div className="grid grid-cols-2 gap-2">
        <Autocomplete
          value={projectName}
          onChange={setProjectName}
          onSelect={(o) => {
            setSelectedProjectId(o.id);
            // Trocar o projeto zera a categoria: o recorte de opções mudou.
            setSelectedCategoryId(null);
            setCategoryName("");
          }}
          options={projects}
          placeholder="Projeto"
        />
        <Autocomplete
          value={categoryName}
          onChange={(v) => {
            setCategoryName(v);
            const cat = categories.find((c) => c.name === v);
            if (cat) setBillable(cat.defaultBillable);
          }}
          onSelect={(o) => {
            setSelectedCategoryId(o.id);
            const cat = categories.find((c) => c.id === o.id);
            if (cat) setBillable(cat.defaultBillable);
          }}
          options={categoryOptions}
          placeholder="Categoria"
        />
      </div>

      {/* Alternância, não ação: fica fora do `Button` porque o estado ligado é a
          cor do próprio significado (`billable`), que nenhuma variante expressa. */}
      <button
        type="button"
        onClick={() => setBillable((b) => !b)}
        title={billable ? "Billable — clique para alternar" : "Non-billable — clique para alternar"}
        className={`flex items-center gap-1.5 self-start px-3 py-2 text-sm font-medium rounded-control border transition-colors ${
          billable
            ? "bg-billable/10 border-billable/40 text-billable"
            : "bg-raised border-border text-fg-secondary hover:text-fg"
        }`}
      >
        <DollarSign size={14} />
        {billable ? "Billable" : "Non-billable"}
      </button>

      <CustomFieldInputs fields={activeFields} values={customValues} onChange={setCustomValues} />
    </Modal>
  );
}
