import { importMondayCategories } from "@domain/usecases/monday/importMondayCategories";
import { useRepositories } from "@presentation/contexts/RepositoriesContext";
import type { MondayProjectMapping } from "@shared/types/mondayConfig";
import { notifyCategoriesChanged } from "@shared/utils/catalogSync";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useCallback, useEffect, useState } from "react";

/**
 * Uma categoria por Activity Type dos boards importados. O envio casa os dois
 * **pelo nome**, então renomear a categoria a desliga da coluna do Monday.
 */
export function MondayCategoriesImport({
  mappings,
  deskclockWorkspaceId,
  reloadCategories,
}: {
  mappings: MondayProjectMapping[];
  deskclockWorkspaceId: string;
  reloadCategories: () => Promise<void>;
}) {
  const { categoryRepo } = useRepositories();
  const [importing, setImporting] = useState(false);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());

  const labels = [...new Set(mappings.flatMap((m) => m.activityTypeLabels))];

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
      hint="Cada Activity Type vira uma categoria. Boards de cliente nascem billable; o board interno, non-billable. Categorias que já existem não são alteradas."
      action={
        <ImportActionButton
          label={known > 0 ? "Atualizar" : "Importar"}
          busy={importing}
          disabled={labels.length === 0 || !deskclockWorkspaceId}
          title={labels.length === 0 ? "Importe os projetos primeiro." : undefined}
          onClick={handleImport}
        />
      }
    >
      {labels.length === 0 ? (
        <p className="text-xs text-gray-600 italic">
          Importe os projetos para carregar os Activity Types dos boards.
        </p>
      ) : (
        <p className="text-[11px] text-gray-500">
          {known} de {labels.length} Activity Type(s) já existem como categoria no destino.
        </p>
      )}
    </ImportCard>
  );
}
