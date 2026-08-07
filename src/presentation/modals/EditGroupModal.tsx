import { useState } from "react";
import { X, DollarSign } from "lucide-react";
import type { Project } from "@domain/entities/Project";
import type { Category } from "@domain/entities/Category";
import type { CustomValues } from "@domain/entities/CustomField";
import type { TaskGroup } from "@domain/utils/groupTasks";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { useCustomFields } from "@presentation/hooks/useCustomFields";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useEscapeToClose } from "@presentation/hooks/useEscapeToClose";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

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

  useEscapeToClose(onClose);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/80">
      <div
        onKeyDown={handleKeyDown}
        className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-5 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">Editar grupo</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {group.tasks.length} tarefas serão atualizadas
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (opcional)"
            autoFocus
            autoComplete="off"
            className="w-full px-2.5 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
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

          <button
            type="button"
            onClick={() => setBillable((b) => !b)}
            title={
              billable ? "Billable — clique para alternar" : "Non-billable — clique para alternar"
            }
            className={`flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors ${
              billable
                ? "bg-green-900/40 border-green-700 text-green-400"
                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-300"
            }`}
          >
            <DollarSign size={14} />
            {billable ? "Billable" : "Non-billable"}
          </button>

          <CustomFieldInputs
            fields={activeFields}
            values={customValues}
            onChange={setCustomValues}
          />
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
