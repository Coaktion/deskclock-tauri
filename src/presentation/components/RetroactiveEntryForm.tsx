import type { Category } from "@domain/entities/Category";
import type { CustomField } from "@domain/entities/CustomField";
import type { Project } from "@domain/entities/Project";
import { Autocomplete } from "@presentation/components/Autocomplete";
import { CustomFieldInputs } from "@presentation/components/CustomFieldInputs";
import { formColumnClass } from "@presentation/components/fieldStyles";
import { RetroactiveTextFields } from "@presentation/components/retroactive/RetroactiveTextFields";
import { RetroactiveTimeFields } from "@presentation/components/retroactive/RetroactiveTimeFields";
import { BillableChip, Field, Input, SegmentedControl } from "@presentation/components/ui";
import type { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
import { useProjectCategoryMap } from "@presentation/hooks/useProjectCategoryMap";
import { useRetroactiveTextEntry } from "@presentation/hooks/useRetroactiveTextEntry";
import { useSubmitOnEnter } from "@presentation/hooks/useSubmitOnEnter";
import type { RetroactiveEntryMode } from "@shared/types/appConfig";

interface RetroactiveEntryFormProps {
  form: ReturnType<typeof useRetroactiveForm>;
  projects: Project[];
  categories: Category[];
  customFields: CustomField[];
  mode: RetroactiveEntryMode;
  onModeChange: (mode: RetroactiveEntryMode) => void;
}

const MODE_OPTIONS = [
  { value: "form", label: "Formulário" },
  { value: "ai", label: "IA" },
] as const satisfies readonly { value: RetroactiveEntryMode; label: string }[];

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
 *
 * **Duas abas, um formulário só.** A aba IA troca os campos do "quê" pelo texto
 * curto e a prévia; os horários, o erro e o Adicionar são os mesmos, do mesmo
 * `useRetroactiveForm` — é o que mantém a cadeia de horários nas duas.
 */
export function RetroactiveEntryForm({
  form,
  projects,
  categories,
  customFields,
  mode,
  onModeChange,
}: RetroactiveEntryFormProps) {
  const textEntry = useRetroactiveTextEntry(form);
  const submit = (overrideEndHHMM?: string) =>
    void (mode === "ai" ? textEntry.submit(overrideEndHHMM) : form.handleAdd(overrideEndHHMM));
  const handleKeyDown = useSubmitOnEnter(() => submit());

  return (
    <div className={formColumnClass} onKeyDown={handleKeyDown}>
      <SegmentedControl
        value={mode}
        onChange={onModeChange}
        options={MODE_OPTIONS}
        ariaLabel="Modo de lançamento"
      />

      {mode === "ai" ? (
        <RetroactiveTextFields entry={textEntry} inputRef={form.nameRef} />
      ) : (
        <WhatFields
          form={form}
          projects={projects}
          categories={categories}
          customFields={customFields}
        />
      )}

      <RetroactiveTimeFields form={form} onSubmit={submit} />

      {form.error && <p className="text-xs text-danger">{form.error}</p>}

      <button
        onClick={() => submit()}
        disabled={form.saving}
        className="w-full px-4 py-1.5 text-sm font-medium bg-accent hover:opacity-90 text-white rounded-control transition-opacity disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
}

type WhatFieldsProps = Omit<RetroactiveEntryFormProps, "mode" | "onModeChange">;

/** O "quê" da aba Formulário: nome, projeto, categoria com billable e campos personalizados. */
function WhatFields({ form, projects, categories, customFields }: WhatFieldsProps) {
  const { categoriesFor } = useProjectCategoryMap();
  const categoryOptions = categoriesFor(categories, form.selectedProjectId);

  return (
    <>
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
    </>
  );
}
