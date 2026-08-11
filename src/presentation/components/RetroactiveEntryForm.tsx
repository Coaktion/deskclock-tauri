import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { formColumnClass } from "@presentation/components/fieldStyles";
import { BillableChip, Field, Input } from "@presentation/components/ui";
import type { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";

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
 * **Todo campo tem rótulo em overline acima da caixa** (`Field`), como o spec da
 * 3f desenha. Eram placeholders, com o argumento de que o rótulo faria a coluna
 * alternar texto e caixa a cada linha — mas metade dela já tinha rótulo (o
 * entalhe da duração e das horas), então o que existia era a alternância entre
 * dois desenhos de campo, não a economia dela. O placeholder continua, dizendo
 * o formato ("Buscar projeto…", "HH:MM"); o rótulo diz o que é.
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
      <Field label="Nome" htmlFor="retro-name">
        <Input
          id="retro-name"
          ref={form.nameRef}
          variant="bare"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder="Nome da tarefa"
        />
      </Field>

      <Field label="Projeto" htmlFor="retro-project">
        <Autocomplete
          id="retro-project"
          value={form.projectName}
          onChange={form.setProjectName}
          onSelect={(o) => {
            form.setSelectedProjectId(o.id);
            form.clearCategory();
          }}
          options={projects}
          placeholder="Buscar projeto…"
          variant="bare"
        />
      </Field>

      <Field label="Categoria" htmlFor="retro-category" boxClassName="flex items-center pr-2">
        <Autocomplete
          id="retro-category"
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
          placeholder="Buscar categoria…"
          className="flex-1"
          variant="bare"
        />
        <BillableChip billable={form.billable} onToggle={() => form.setBillable((b) => !b)} />
      </Field>

      <CustomFieldInputs
        fields={customFields}
        values={form.customValues}
        onChange={form.setCustomValues}
        compact
        className="space-y-3"
      />

      <Field label="Duração" htmlFor="retro-duration" boxClassName="flex items-center">
        <Input
          id="retro-duration"
          data-tour="retroactive-duration"
          variant="bare"
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
          title="Aceita: 1:30, 90, 1h, 1h 30m"
          className="w-20!"
        />
        <span className="w-full pr-2.5 text-xs text-fg-muted truncate">Use: 1h30, 1h, 30...</span>
      </Field>

      <div data-tour="retroactive-timeinputs" className="flex gap-2">
        <Field label="Início" htmlFor="retro-start" className="flex-1">
          <Input
            id="retro-start"
            type="time"
            variant="bare"
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
          />
        </Field>
        <Field label="Fim" htmlFor="retro-end" className="flex-1">
          <Input
            id="retro-end"
            type="time"
            variant="bare"
            value={form.endTime}
            onChange={(e) => form.handleEndChange(e.target.value)}
            onBlur={(e) => form.handleEndCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || form.endTime) return;
              e.preventDefault();
              form.handleEndCommit("");
            }}
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
