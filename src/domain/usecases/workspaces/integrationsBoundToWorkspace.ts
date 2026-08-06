import type {
  IIntegrationWorkspacePort,
  IntegrationWorkspaceReadKey,
} from "@domain/integrations/IIntegrationWorkspacePort";
import { resolveIntegrationWorkspaceId } from "@domain/usecases/workspaces/resolveIntegrationWorkspaceId";
import type { UUID } from "@shared/types";
import type { IntegrationWorkspaceKey } from "@shared/types/appConfig";

export interface IntegrationWorkspaceBinding {
  key: IntegrationWorkspaceKey;
  /** Nome da integração, como ela aparece na tela de Integrações. */
  label: string;
  /** O que ela deixa de fazer — a consequência, não o mecanismo. */
  consequence: string;
  /**
   * O vínculo vem do "Padrão" implícito, não de uma escolha. É o caso que a tela
   * de Integrações não mostra: a chave está vazia e ninguém nomeou workspace
   * nenhum, mas apagar o "Padrão" quebra a integração do mesmo jeito.
   */
  implicit: boolean;
}

interface IntegrationDescriptor {
  key: IntegrationWorkspaceKey;
  label: string;
  consequence: string;
  /** Chave que prova que alguém conectou a integração. */
  connection: IntegrationWorkspaceReadKey;
}

/**
 * Ordem de exibição — a mesma da tela de Integrações, para o aviso listar as
 * integrações onde o usuário vai procurá-las.
 */
const INTEGRATIONS: IntegrationDescriptor[] = [
  {
    key: "mondayDeskclockWorkspaceId",
    label: "Monday",
    consequence: "para de importar itens e de enviar horas",
    connection: "mondayApiKey",
  },
  {
    key: "clockifyDeskclockWorkspaceId",
    label: "Clockify",
    consequence: "para de importar projetos e de enviar horas",
    connection: "clockifyApiKey",
  },
  {
    key: "sheetsDeskclockWorkspaceId",
    label: "Google Sheets",
    consequence: "para de enviar horas para a planilha",
    connection: "googleRefreshToken",
  },
  {
    key: "calendarDeskclockWorkspaceId",
    label: "Google Agenda",
    // Só o import manual: o rastreio automático de reuniões cria no workspace
    // ativo e não depende desta chave (§5.7). Dizer "para de rastrear reuniões"
    // seria assustar com o que não vai acontecer.
    consequence: "para de importar eventos como planejadas",
    connection: "googleRefreshToken",
  },
  {
    key: "zendeskDeskclockWorkspaceId",
    label: "Zendesk",
    consequence: "para de importar tickets como planejadas",
    connection: "zendeskAccessToken",
  },
];

/**
 * Integrações conectadas que trabalham neste workspace do DeskClock.
 *
 * Existe para o modal de exclusão poder avisar antes: excluído o workspace, a
 * chave da integração passa a apontar para um id que não existe mais, e ela
 * **para em silêncio** — a busca não devolve nada e não há erro a exibir. Como
 * a exclusão não tem desfazer, o aviso é a única defesa.
 *
 * **Não é uma trava.** Quem quer excluir mesmo assim segue em frente e depois
 * escolhe outro workspace em Integrações; o que não pode é descobrir a quebra
 * semanas depois, ao notar que as horas pararam de subir.
 */
export function integrationsBoundToWorkspace(
  config: IIntegrationWorkspacePort,
  workspaceId: UUID
): IntegrationWorkspaceBinding[] {
  return INTEGRATIONS.filter((i) => !!config.get(i.connection))
    .filter((i) => resolveIntegrationWorkspaceId(config.get(i.key)) === workspaceId)
    .map(({ key, label, consequence }) => ({
      key,
      label,
      consequence,
      implicit: !config.get(key),
    }));
}
