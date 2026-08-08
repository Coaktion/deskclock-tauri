import { importMondayFieldCatalogs } from "@domain/usecases/monday/importMondayFieldCatalogs";
import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { useIntegrations } from "@presentation/contexts/IntegrationsContext";
import type { MondayFieldCatalogs } from "@shared/types/mondayConfig";
import { showToast } from "@shared/utils/toast";
import { ImportActionButton, ImportCard } from "./ImportCard";
import { useState } from "react";

/**
 * Uma leitura do board de Report traz os quatro conjuntos de rótulos.
 *
 * O Report não recebe apontamento — as horas vão direto ao board do projeto —,
 * mas é o único lugar onde os rótulos de cliente e os de projeto interno
 * convivem. Ler os quatro de uma vez evita quatro idas ao Monday para montar
 * quatro campos que sempre são configurados juntos.
 *
 * O resultado fica na config: sem o cache, abrir esta tela custaria uma consulta
 * só para dizer quantos rótulos faltam em cada campo.
 */
export function MondayCatalogsImport({
  catalogs,
  onRead,
}: {
  catalogs: MondayFieldCatalogs;
  onRead: (catalogs: MondayFieldCatalogs) => void;
}) {
  const config = useAppConfig();
  const factories = useIntegrations();
  const [busy, setBusy] = useState(false);

  const reportBoardId = config.isLoaded ? config.get("mondayReportBoardId") : "";
  // O Report Type continua sendo lido e cacheado — acordar a feature não pode
  // depender de reler o board —, mas fica **fora da conta e do resumo**: campo
  // que a tela não oferece, contado aqui, viraria uma pergunta sem resposta.
  const total =
    catalogs.activityType.length + catalogs.projectStage.length + catalogs.nonBillableReason.length;

  async function handleRead() {
    setBusy(true);
    try {
      const result = await importMondayFieldCatalogs({
        api: factories.createMondayApi(),
        reportBoardId,
      });
      await config.set("mondayFieldCatalogs", result);
      onRead(result);
      await showToast(
        "success",
        `${result.activityType.length} Activity Type(s), ${result.projectStage.length} Project Stage(s) e ${result.nonBillableReason.length} motivo(s).`
      );
    } catch (err) {
      await showToast("error", err instanceof Error ? err.message : "Erro ao ler os catálogos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportCard
      title="Catálogos"
      hint="Lê o board de Report de Horas e traz os rótulos que semeiam as categorias e os campos abaixo."
      action={
        <ImportActionButton
          label={total > 0 ? "Atualizar" : "Ler catálogos"}
          busy={busy}
          disabled={!reportBoardId}
          title={!reportBoardId ? "Informe o id do board de Report de Horas acima." : undefined}
          onClick={handleRead}
        />
      }
    >
      {total === 0 ? (
        <p className="text-xs text-gray-600 italic">Catálogos ainda não lidos.</p>
      ) : (
        <p className="text-xs text-gray-500">
          {catalogs.activityType.length} Activity Type · {catalogs.projectStage.length} Project
          Stage · {catalogs.nonBillableReason.length} motivo de non-billable
        </p>
      )}
    </ImportCard>
  );
}
