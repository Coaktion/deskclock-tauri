import { useAppConfig } from "@presentation/contexts/ConfigContext";
import { mergeLabels } from "@domain/usecases/monday/importMondayFieldCatalogs";
import { normalizeProjectMappings } from "@domain/usecases/monday/normalizeProjectMappings";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import {
  EMPTY_FIELD_CATALOGS,
  type MondayFieldCatalogs,
  type MondayProjectMapping,
} from "@shared/types/mondayConfig";
import { DownloadCloud } from "lucide-react";
import { useEffect, useState } from "react";
import { SubSection } from "../shared";
import { MondayCatalogField } from "./MondayCatalogField";
import { MondayCatalogsImport } from "./MondayCatalogsImport";
import { MondayCategoriesImport } from "./MondayCategoriesImport";
import { MondayProjectsImport } from "./MondayProjectsImport";

/**
 * Traz do Monday o que o DeskClock precisa para registrar horas: projetos,
 * categorias e as opções dos três campos de atividade. Não há tabela de
 * mapeamento a manter — o nome no DeskClock **é** o rótulo no board.
 */
export function MondayImportSection({
  reloadProjects,
  reloadCategories,
}: {
  reloadProjects: () => Promise<void>;
  reloadCategories: () => Promise<void>;
}) {
  const config = useAppConfig();
  const [mappings, setMappings] = useState<MondayProjectMapping[]>([]);
  const [catalogs, setCatalogs] = useState<MondayFieldCatalogs>(EMPTY_FIELD_CATALOGS);

  useEffect(() => {
    if (!config.isLoaded) return;
    setMappings(normalizeProjectMappings(config.get("mondayProjectMapping")));
    setCatalogs(config.get("mondayFieldCatalogs") ?? EMPTY_FIELD_CATALOGS);
    // Relê só quando a config carrega: `config` é recriado a cada render do
    // provider e sobrescreveria um import em curso.
  }, [config.isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // O destino é o workspace da integração, não o ativo nem um seletor só desta
  // seção: o import manual e o rastreador precisam criar no mesmo lugar, ou o
  // dedupe de `monday_imported_items` — chaveado por (item, workspace) — se
  // parte em dois e a mesma planejada nasce duas vezes.
  const destinationId = resolveIntegrationWorkspaceId(
    config.isLoaded ? config.get("mondayDeskclockWorkspaceId") : ""
  );

  // Os rótulos de etapa vêm do catálogo e, como reserva, de qualquer projeto
  // **de cliente**: nos boards internos a coluna se chama "Project Phase" e traz
  // outros quatro rótulos, que não são a etapa que o envio das horas preenche.
  // Os 18 do Report batem exatamente com os dos boards de cliente, então as duas
  // origens dizem a mesma coisa — a reserva existe para a tela não ficar vazia
  // enquanto os catálogos não forem lidos.
  const stageSource = mappings.find(
    (m) => m.scope === "cliente" && m.projectStageLabels.length > 0
  );
  const stageLabels = mergeLabels(catalogs.projectStage, stageSource?.projectStageLabels ?? []);

  return (
    <SubSection icon={<DownloadCloud size={14} />} title="Importação de dados">
      <div className="pb-2 space-y-3">
        <MondayProjectsImport
          mappings={mappings}
          deskclockWorkspaceId={destinationId}
          onImported={setMappings}
          reloadProjects={reloadProjects}
        />

        <MondayCatalogsImport catalogs={catalogs} onRead={setCatalogs} />

        <MondayCategoriesImport
          mappings={mappings}
          catalogLabels={catalogs.activityType}
          deskclockWorkspaceId={destinationId}
          reloadCategories={reloadCategories}
        />

        <MondayCatalogField
          title="Project Stage"
          hint="Etapa do projeto na atividade. Só entra no apontamento de projeto de cliente — nos boards internos a coluna homônima tem outros rótulos."
          configKey="mondayProjectStageFieldId"
          optionLabels={stageLabels}
          defaultFieldLabel={stageSource?.projectStageTitle ?? "Project Stage"}
        />

        {/*
          O card do Report Type está **adormecido**, não removido: o roteamento
          por grupo existe e é testado, mas o time ainda não fechou o que cada
          valor significa, e um campo que ninguém sabe preencher mandaria hora
          para o grupo errado do board do cliente. Toda atividade vai como
          `Activity` enquanto isso — ver `MondayTaskSender.catalogFields`.
          Acordar é devolver este bloco e o `reportType` do sender.
        */}

        <MondayCatalogField
          title="Non Billable reason"
          hint="Por que a hora não foi faturada. Obrigatório em projeto de cliente marcado como non-billable; dispensado em projeto interno."
          configKey="mondayNonBillableReasonFieldId"
          optionLabels={catalogs.nonBillableReason}
        />
      </div>
    </SubSection>
  );
}
