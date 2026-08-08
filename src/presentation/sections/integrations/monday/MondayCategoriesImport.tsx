import {
  activityTypeCatalog,
  importMondayCategories,
} from "@domain/usecases/monday/importMondayCategories";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { notifyCategoriesChanged } from "@shared/utils/catalogSync";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useCallback, useEffect, useState } from "react";

/**
 * Uma categoria por Activity Type. O envio casa os dois **pelo nome**, então
 * renomear a categoria a desliga da coluna do Monday.
 */
export function MondayCategoriesImport({
  mappings,
  catalogLabels,
  deskclockWorkspaceId,
  reloadCategories,
}: {
  /** Rótulos cacheados dos boards e o escopo de cada um. */
  mappings: MondayProjectMapping[];
  /** Activity Types do board de Report. */
  catalogLabels: string[];
  deskclockWorkspaceId: string;
  reloadCategories: () => Promise<void>;
}) {
  const { categoryRepo } = useRepositories();
  const [importing, setImporting] = useState(false);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  // A mesma função que o import usa: contar por outro caminho faria o número da
  // tela divergir do que o clique cria.
  const labels = activityTypeCatalog(catalogLabels, mappings);

  // As categorias do **destino**, que pode não ser o workspace ativo — usar a
  // lista do app contaria de outro lugar e mentiria sobre o que falta importar.
  const loadExisting = useCallback(async () => {
    if (!deskclockWorkspaceId) return;
    const rows = await categoryRepo.findAll(deskclockWorkspaceId);
    setExistingNames(new Set(rows.map((c) => c.name)));
  }, [categoryRepo, deskclockWorkspaceId]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const known = labels.filter((l) => existingNames.has(l)).length;

  async function handleImport() {
    setImporting(true);
    try {
      const { created, existing } = await importMondayCategories({
        categoryRepo,
        catalogLabels,
        mappings,
        deskclockWorkspaceId,
      });
      await loadExisting();
      await reloadCategories();
      await notifyCategoriesChanged();
      await showToast(
        "success",
        `${created.length} categoria(s) criada(s); ${existing.length} já existia(m).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao importar categorias.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <ImportCard
      title="Categorias"
      hint="Cada Activity Type vira uma categoria. Rótulo de board de cliente nasce billable; de projeto interno, non-billable. Categorias que já existem não são alteradas."
      action={
        <ImportActionButton
          label={known > 0 ? "Atualizar" : "Importar"}
          busy={importing}
          disabled={labels.length === 0 || !deskclockWorkspaceId}
          title={labels.length === 0 ? "Leia os catálogos ou importe os projetos." : undefined}
          onClick={handleImport}
        />
      }
    >
      {labels.length === 0 ? (
        <p className="text-xs text-fg-muted italic">
          Leia os catálogos, ou importe os projetos, para carregar os Activity Types.
        </p>
      ) : (
        <p className="text-xs text-fg-muted">
          {known} de {labels.length} Activity Type(s) já existem como categoria no destino.
        </p>
      )}
    </ImportCard>
  );
}
