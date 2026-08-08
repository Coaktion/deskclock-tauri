import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import {
  bareInputClass,
  boxClass,
  fieldClass,
  formColumnClass,
} from "@presentation/components/fieldStyles";
import { Field, fieldControlClass } from "@presentation/components/ui";
import type { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import { DollarSign } from "lucide-react";

interface RetroactiveEntryFormProps {
  form: ReturnType<typeof useRetroactiveForm>;
  projects: Project[];
  categories: Category[];
  customFields: CustomField[];
}

/**
 * Coluna de entrada da tela de Lançamento Manual. Vive à esquerda, fixa e
 * estreita, com a lista de apontamentos do dia ao lado: com campos
 * personalizados o formulário cresce sem limite, e empilhado sobre a lista ele
 * empurrava os registros do dia para fora da tela.
 *
 * Os rótulos são placeholders — inclusive os dos campos personalizados — para
 * a coluna não virar uma alternância de texto e caixa a cada linha.
 */
export function RetroactiveEntryForm({
  form,
  projects,
  categories,
  customFields,
}: RetroactiveEntryFormProps) {
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, form.selectedProjectId);
  const handleKeyDown = useSubmitOnEnter(() => void form.handleAdd());

  return (
    <div className={formColumnClass} onKeyDown={handleKeyDown}>
      <input
        ref={form.nameRef}
        type="text"
        value={form.name}
        onChange={(e) => form.setName(e.target.value)}
        placeholder="Nome da tarefa"
        autoComplete="off"
        className={fieldClass}
      />

      <Autocomplete
        value={form.projectName}
        onChange={form.setProjectName}
        onSelect={(o) => {
          form.setSelectedProjectId(o.id);
          form.clearCategory();
        }}
        options={projects}
        placeholder="Projeto"
      />

      <div className={`${boxClass} flex items-center pr-2`}>
        <Autocomplete
          value={form.categoryName}
          onChange={(v) => {
            form.setCategoryName(v);
            const cat = categories.find((c) => c.name === v);
            if (cat) form.setBillable(cat.defaultBillable);
          }}
          onSelect={(o) => {
            form.setSelectedCategoryId(o.id);
            const cat = categories.find((c) => c.id === o.id);
            if (cat) form.setBillable(cat.defaultBillable);
          }}
          options={categoryOptions}
          placeholder="Categoria"
          className="flex-1"
          inputClassName={bareInputClass}
        />
        <button
          type="button"
          onClick={() => form.setBillable((b) => !b)}
          title={
            form.billable
              ? "Billable — clique para alternar"
              : "Non-billable — clique para alternar"
          }
          className={`flex items-center gap-1 shrink-0 transition-colors ${
            form.billable ? "text-billable" : "text-fg-muted hover:text-fg-secondary"
          }`}
        >
          <DollarSign size={14} />
        </button>
      </div>

      <CustomFieldInputs
        fields={customFields}
        values={form.customValues}
        onChange={form.setCustomValues}
        compact
        className="space-y-3"
      />

      {/* O wrapper existe só para receber o `space-y-3` do pai. Sem ele, o
          `mt-1.5` da caixa cairia no mesmo elemento e *substituiria* a margem do
          space-y em vez de somar — foi por isso que, no rascunho, a duração
          precisou de 16px enquanto início e fim se resolveram com 6px. */}
      <div>
        <Field label="Duração" htmlFor="retro-duration" className="mt-4.5 flex items-center">
          <input
            id="retro-duration"
            data-tour="retroactive-duration"
            type="text"
            value={form.durationInput}
            onChange={(e) => form.setDurationInput(e.target.value)}
            onBlur={form.commitDuration}
            onKeyDown={(e) => {
              // Consome porque tem trabalho próprio antes do submit: o Enter não
              // dispara o `onBlur`, então a duração digitada precisa virar hora
              // de fim aqui — senão a tarefa nasceria com o fim antigo.
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              const newEnd = form.commitDuration();
              void form.handleAdd(newEnd || undefined);
            }}
            placeholder="HH:MM"
            autoComplete="off"
            title="Aceita: 1:30, 90, 1h, 1h 30m"
            className={`${fieldControlClass} w-20! pt-3`}
          />
          <span className="w-full pt-3 pb-1.5 pr-2.5 text-xs text-fg-muted truncate">
            Use: 1h30, 1h, 30...
          </span>
        </Field>
      </div>

      <div data-tour="retroactive-timeinputs" className="flex gap-2">
        <Field label="Início" htmlFor="retro-start" className="flex-1">
          <input
            id="retro-start"
            type="time"
            value={form.startTime}
            onChange={(e) => form.handleStartChange(e.target.value)}
            onBlur={(e) => form.handleStartCommit(e.target.value)}
            onKeyDown={(e) => {
              // Campo vazio: o Enter restaura o valor anterior e para por aqui —
              // o segundo Enter é que adiciona. Preenchido, sobe para o submit.
              if (e.key !== "Enter" || form.startTime) return;
              e.preventDefault();
              form.handleStartCommit("");
            }}
            autoComplete="off"
            className={`${fieldControlClass} pt-3`}
          />
        </Field>
        <Field label="Fim" htmlFor="retro-end" className="flex-1">
          <input
            id="retro-end"
            type="time"
            value={form.endTime}
            onChange={(e) => form.handleEndChange(e.target.value)}
            onBlur={(e) => form.handleEndCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || form.endTime) return;
              e.preventDefault();
              form.handleEndCommit("");
            }}
            autoComplete="off"
            className={`${fieldControlClass} pt-3`}
          />
        </Field>
      </div>

      {form.error && <p className="text-xs text-danger">{form.error}</p>}

      <button
        onClick={() => void form.handleAdd()}
        disabled={form.saving}
        className="w-full px-4 py-1.5 text-sm font-medium bg-accent hover:opacity-90 text-white rounded-control transition-opacity disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
}
