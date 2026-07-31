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
    notchedBoxClass,
    notchedLabelClass,
} from "@presentation/components/fieldStyles";
import type { useRetroactiveForm } from "@presentation/hooks/useRetroactiveForm";
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
  return (
    <div data-tour="retroactive-form" className={formColumnClass}>
      <input
        ref={form.nameRef}
        type="text"
        value={form.name}
        onChange={(e) => form.setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) void form.handleAdd();
        }}
        placeholder="Nome da tarefa"
        className={fieldClass}
      />

      <Autocomplete
        value={form.projectName}
        onChange={form.setProjectName}
        onSelect={(o) => form.setSelectedProjectId(o.id)}
        onEnter={form.handleAdd}
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
          onEnter={form.handleAdd}
          options={categories}
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
            form.billable ? "text-green-400" : "text-gray-500 hover:text-gray-400"
          }`}
        >
          <DollarSign size={14} />
        </button>
      </div>

      <CustomFieldInputs
        fields={customFields}
        values={form.customValues}
        onChange={form.setCustomValues}
        onEnter={() => void form.handleAdd()}
        compact
        labelsAsPlaceholder
        className="space-y-3"
      />

      {/* O wrapper existe só para receber o `space-y-3` do pai. Sem ele, o
          `mt-1.5` da caixa cairia no mesmo elemento e *substituiria* a margem do
          space-y em vez de somar — foi por isso que, no rascunho, a duração
          precisou de 16px enquanto início e fim se resolveram com 6px. */}
      <div>
        <div className={`${boxClass} ${notchedBoxClass} mt-4.5 flex items-center`}>
          <label htmlFor="retro-duration" className={notchedLabelClass}>
            Duração
          </label>
          <input
            id="retro-duration"
            data-tour="retroactive-duration"
            type="text"
            value={form.durationInput}
            onChange={(e) => form.setDurationInput(e.target.value)}
            onBlur={form.commitDuration}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const newEnd = form.commitDuration();
                if (newEnd) void form.handleAdd(newEnd);
              }
            }}
            placeholder="HH:MM"
            title="Aceita: 1:30, 90, 1h, 1h 30m"
            className={`${bareInputClass} w-20! pt-3 text-gray-100 placeholder-gray-600`}
          />
          <span className="w-full pt-3 pb-1.5 pr-2.5 text-xs text-gray-600 truncate">
            Use: 1h30, 1h, 30...
          </span>
        </div>
      </div>

      <div data-tour="retroactive-timeinputs" className="flex gap-2">
        <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
          <label htmlFor="retro-start" className={notchedLabelClass}>
            Início
          </label>
          <input
            id="retro-start"
            type="time"
            value={form.startTime}
            onChange={(e) => form.handleStartChange(e.target.value)}
            onBlur={(e) => form.handleStartCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (!form.startTime) {
                  form.handleStartCommit("");
                  return;
                }
                void form.handleAdd();
              }
            }}
            className={`${bareInputClass} pt-3`}
          />
        </div>
        <div className={`${boxClass} ${notchedBoxClass} flex-1`}>
          <label htmlFor="retro-end" className={notchedLabelClass}>
            Fim
          </label>
          <input
            id="retro-end"
            type="time"
            value={form.endTime}
            onChange={(e) => form.handleEndChange(e.target.value)}
            onBlur={(e) => form.handleEndCommit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.stopPropagation();
                if (!form.endTime) {
                  form.handleEndCommit("");
                  return;
                }
                void form.handleAdd();
              }
            }}
            className={`${bareInputClass} pt-3`}
          />
        </div>
      </div>

      {form.error && <p className="text-xs text-red-400">{form.error}</p>}

      <button
        onClick={() => void form.handleAdd()}
        disabled={form.saving}
        className="w-full px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
      >
        Adicionar
      </button>
    </div>
  );
}
