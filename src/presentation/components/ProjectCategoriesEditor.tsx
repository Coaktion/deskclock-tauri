import { useMemo, useState } from "react";
import type { Category } from "@domain/entities/Category";
import type { ProjectCategorySource } from "@domain/entities/ProjectCategory";
import type { UUID } from "@shared/types";
import { fuzzyMatch } from "@shared/utils/fuzzySearch";
import { SearchInput } from "@presentation/components/ui";

interface ProjectCategoriesEditorProps {
  categories: Category[];
  /** Ids associados hoje, na origem em que estão gravados. */
  sourceById: Map<UUID, ProjectCategorySource>;
  onToggle: (categoryId: UUID) => void;
  onClearAll: () => void;
}

/**
 * Bloco que abre na linha do projeto para escolher quais categorias ele oferece.
 *
 * **Sem botão de salvar:** cada clique grava, como o toggle de billable das
 * listas de tarefas. Um "Salvar" aqui seria um segundo clique para confirmar o
 * que a caixa já disse, e a tela não tem outro estado a compor.
 *
 * O filtro aparece só quando a lista é longa o bastante para justificá-lo — com
 * seis categorias ele custa uma linha e não economiza nenhuma rolagem.
 */
export function ProjectCategoriesEditor({
  categories,
  sourceById,
  onToggle,
  onClearAll,
}: ProjectCategoriesEditorProps) {
  const [search, setSearch] = useState("");
  const showSearch = categories.length > 12;
  const filtered = useMemo(
    () => (search ? categories.filter((c) => fuzzyMatch(search, c.name)) : categories),
    [categories, search]
  );

  if (categories.length === 0) {
    return (
      <p className="text-xs text-fg-muted py-2">
        Nenhuma categoria cadastrada neste workspace — não há o que associar.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showSearch && (
        <SearchInput value={search} onChange={setSearch} placeholder="Filtrar categorias..." />
      )}

      {/* Só com mais de uma marcada: com uma só, a própria caixa já é o botão, e
          desmarcar tudo é o caminho de volta ao "oferece todas". Apaga também as
          do Monday — como a caixa individual, e pela mesma razão de ser a saída
          de emergência do filtro. */}
      {sourceById.size > 1 && (
        <button
          type="button"
          onClick={onClearAll}
          className="self-start px-2 py-1 text-[11px] bg-raised border border-border hover:border-fg-muted text-fg-secondary hover:text-fg rounded-control transition-colors"
        >
          Desmarcar todas ({sourceById.size})
        </button>
      )}

      <div className="max-h-48 overflow-y-auto flex flex-col">
        {filtered.length === 0 ? (
          <p className="text-xs text-fg-muted py-2 text-center">Nenhuma categoria encontrada.</p>
        ) : (
          filtered.map((c) => {
            const source = sourceById.get(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-2 px-2 py-1 rounded-control hover:bg-raised cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={source !== undefined}
                  onChange={() => onToggle(c.id)}
                  className="shrink-0 accent-accent cursor-pointer"
                />
                <span className="flex-1 text-xs text-fg-secondary truncate">{c.name}</span>
                {source === "monday" && (
                  <span
                    title="Veio da varredura do Monday. Desmarcar vale até a próxima varredura — para tirar de vez, remova o Activity Type do quadro."
                    className="shrink-0 px-1 py-0.5 text-[10px] leading-none rounded-chip bg-raised border border-border text-fg-muted"
                  >
                    Monday
                  </span>
                )}
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
