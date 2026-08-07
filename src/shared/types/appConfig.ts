import type { SheetColumnMapping } from "@shared/types/sheetsConfig";
import type { RoundingSlot } from "@shared/utils/roundDuration";
import type {
  ClockifyWorkspaceRef,
  ClockifyProjectMapping,
  ClockifyCategoryMapping,
} from "@shared/types/clockifyConfig";
import type { MondayFieldCatalogs, MondayProjectMapping } from "@shared/types/mondayConfig";

export interface OverlayPosition {
  x: number;
  y: number;
}

/**
 * Workspace do DeskClock em que cada integração trabalha.
 *
 * **Vazio resolve para o workspace "Padrão" na leitura** — ver
 * `resolveIntegrationWorkspaceId`. Nenhuma delas é escrita sozinha: quem tem um
 * workspace só nunca vê o seletor, e a chave só nasce quando alguém escolhe.
 */
export interface IntegrationWorkspaceConfig {
  /** Import de itens, varredura diária de projetos, import de catálogo e envio de horas. */
  mondayDeskclockWorkspaceId: string;
  /** Import de projetos e tags, e envio de apontamentos. */
  clockifyDeskclockWorkspaceId: string;
  /** De qual workspace saem as tarefas do envio à planilha. */
  sheetsDeskclockWorkspaceId: string;
  /**
   * **Só** o "Importar eventos" manual. O rastreio automático de reuniões
   * continua criando no workspace **ativo**: a decisão é registrada, não
   * descuido — ver §5.7 do CLAUDE.md antes de "consertar".
   */
  calendarDeskclockWorkspaceId: string;
  /** Destino dos tickets importados. */
  zendeskDeskclockWorkspaceId: string;
}

export type IntegrationWorkspaceKey = keyof IntegrationWorkspaceConfig;

export interface AppConfig extends IntegrationWorkspaceConfig {
  // Geral
  setupCompleted: boolean;
  userName: string;
  showWelcomeMessage: boolean;
  startOnBoot: boolean;
  liveTrayTimer: boolean;
  closeOnFocusLoss: boolean;
  discardTasksUnderOneMinute: boolean;
  showIntegrationsRail: boolean;
  /**
   * Colunas de entrada recolhidas, por tela. Persistidas — quem recolhe o
   * formulário quer a lista com a tela inteira, e reabri-lo a cada navegação
   * desfaria justamente o que se pediu. Não aparecem em Configurações: o
   * controle é o próprio botão da coluna.
   */
  planningFormCollapsed: boolean;
  retroactiveFormCollapsed: boolean;
  /**
   * Largura arrastada de cada coluna de entrada, em px. Chave separada do
   * recolhido de propósito: é o que faz a coluna reabrir na largura em que
   * estava, inclusive quando quem a recolheu foi o próprio arraste.
   */
  planningFormWidth: number;
  retroactiveFormWidth: number;
  /**
   * Teto da lista de planejadas do Lançamento Manual, em px. É **teto**, não
   * altura: com duas planejadas a seção continua encolhendo até o conteúdo, como
   * fazia com o `max-h-36` que este valor substituiu.
   */
  retroactivePlannedHeight: number;
  // Acessibilidade
  fontSize: "P" | "M" | "G" | "GG";
  theme: "azul" | "verde" | "escuro" | "claro";
  // Atalhos globais
  shortcutToggleTask: string;
  shortcutStopTask: string;
  shortcutToggleOverlay: string;
  shortcutToggleWindow: string;
  // Atalho da janela
  shortcutCommandPalette: string;
  // Overlay
  overlayAlwaysVisible: boolean;
  overlayShowOnStart: boolean;
  overlaySize: "big" | "small";
  overlayOpacity: number;
  overlaySnapToGrid: boolean;
  overlayPosition_execution: OverlayPosition;
  overlayPosition_planning: OverlayPosition;
  overlayPosition_compact: OverlayPosition;
  mainWindowPosition: OverlayPosition;
  // Integrações
  integrationGoogleSheetsSpreadsheetId: string;
  integrationGoogleSheetsSheetName: string;
  integrationGoogleSheetsColumnMapping: SheetColumnMapping;
  integrationGoogleSheetsAutoSync: boolean;
  integrationGoogleSheetsDurationFormat: "HH:MM" | "HH:MM:SS";
  sheetsAutoSyncMode: "per-task" | "daily";
  sheetsAutoSyncTrigger: "fixed-time" | "on-open";
  sheetsAutoSyncTime: string;
  sheetsAutoSyncLastFiredDate: string;
  sheetsDailySyncLastTimestamp: string;
  // Google Agenda
  calendarAutoTrackingEnabled: boolean;
  /**
   * Resultado do último ciclo de rastreamento: "" quando correu bem, a mensagem
   * de erro quando falhou. O ciclo roda em segundo plano e engolia a falha em
   * silêncio — sem este rastro, reunião que não vira planejada é indiagnosticável.
   */
  calendarLastSyncError: string;
  // Tokens Google OAuth
  googleAccessToken: string;
  googleRefreshToken: string;
  googleTokenExpiry: number;
  googleUserEmail: string;
  // Tokens Zendesk OAuth
  zendeskSubdomain: string;
  zendeskClientId: string;
  zendeskClientSecret: string;
  zendeskAccessToken: string;
  zendeskRefreshToken: string;
  zendeskTokenExpiry: number;
  zendeskUserEmail: string;
  // API REST local
  localApiEnabled: boolean;
  localApiPort: number;
  // Jornada
  dailyGoalHours: number;
  weeklyGoalHours: number;
  // Arredondamento de duração
  roundingEnabled: boolean;
  roundingSlots: RoundingSlot[];
  roundingTolerance: number;
  // Clockify
  clockifyApiKey: string;
  clockifyUserEmail: string;
  clockifyUserId: string;
  clockifyActiveWorkspaceId: string;
  clockifyActiveWorkspaceName: string;
  clockifyDefaultTagIds: string[];
  clockifyProjectMapping: ClockifyProjectMapping[];
  clockifyCategoryMapping: ClockifyCategoryMapping[];
  clockifyAutoSync: boolean;
  clockifyAutoSyncMode: "per-task" | "daily";
  clockifyAutoSyncTrigger: "on-open" | "fixed-time";
  clockifyAutoSyncTime: string;
  clockifyAutoSyncLastFiredDate: string;
  clockifyDailySyncLastTimestamp: string;
  clockifyWorkspaceCache: ClockifyWorkspaceRef[];
  // Monday
  mondayApiKey: string;
  mondayUserId: string;
  mondayUserName: string;
  mondayUserEmail: string;
  /**
   * Board que lista os projetos ("Portfólio Aktie Now"). Cada item vira um
   * Project, e é ele que diz em qual board as horas daquele projeto são
   * gravadas.
   *
   * Substituiu cinco escolhas de configuração — workspace do Monday, pasta de
   * clientes, pasta de internos, board interno e o mapeamento manual board ↔
   * projeto — que descreviam à mão o que o próprio Monday já descreve.
   */
  mondayPortfolioBoardId: string;
  /**
   * Board "Report de Horas". **Não é destino de escrita**: criar item ali
   * dispara uma automação que copia o apontamento para o board do projeto, mas
   * não o atualiza nem o exclui — editar ou apagar aqui deixaria órfão o que
   * foi copiado para lá. Serve de catálogo: é o único lugar onde os rótulos de
   * cliente e os de projeto interno convivem, e semeia os dois numa leitura só.
   */
  mondayReportBoardId: string;
  /**
   * Campo personalizado que alimenta a coluna "Project Stage" da atividade.
   * Vazio = a coluna não é preenchida.
   */
  mondayProjectStageFieldId: string;
  /**
   * Campo personalizado que decide o **grupo** de destino da atividade no board
   * do projeto (Activity → Activities, Meeting → Meetings…). No board de Report
   * o Report Type é coluna; escrevendo direto no board do projeto, ele vira o
   * `group_id`. Vazio, ou sem valor na tarefa, cai em `Activity`.
   */
  mondayReportTypeFieldId: string;
  /**
   * Campo personalizado que alimenta a coluna "Non Billable reason". Responde
   * "por que essa hora de cliente não foi faturada": é **obrigatório** em
   * projeto de cliente marcado como non-billable e dispensado em projeto
   * interno, onde non-billable é a norma.
   */
  mondayNonBillableReasonFieldId: string;
  mondayProjectMapping: MondayProjectMapping[];
  /**
   * Rótulos lidos do board de Report, cacheados para semear categorias e as
   * opções dos três campos personalizados acima.
   *
   * Ficam na config pelo mesmo motivo dos `activityTypeLabels` do mapeamento:
   * sem o cache, abrir a tela de Integrações custaria uma consulta ao Monday só
   * para exibir quantos rótulos faltam em cada campo.
   */
  mondayFieldCatalogs: MondayFieldCatalogs;
  mondayAutoSync: boolean;
  mondayAutoSyncMode: "per-task" | "daily";
  mondayAutoSyncTrigger: "on-open" | "fixed-time";
  mondayAutoSyncTime: string;
  mondayAutoSyncLastFiredDate: string;
  mondayDailySyncLastTimestamp: string;
  /**
   * Importa sozinho, como planejadas, os itens do usuário nos boards mapeados.
   * Requer a API key e o usuário conectado.
   */
  mondayAutoImportEnabled: boolean;
  /**
   * Dia (YYYY-MM-DD) da última releitura automática dos boards como projetos.
   * Vazio = nunca rodou. É o que faz a varredura acontecer **uma vez por dia**:
   * cliente novo no Monday vira Project sozinho, sem depender de alguém lembrar
   * de apertar "Atualizar" na tela de Integrações.
   */
  mondayProjectsSyncLastDate: string;
  /** Falha do último ciclo da releitura, exibida no card de Projetos. */
  mondayProjectsLastSyncError: string;
  // Workspaces
  /** Workspace ativo na UI. Vazio = cai no workspace "Padrão" da migration 011. */
  activeWorkspaceId: string;
  // Tours
  toursSeen: string[];
}

export type ConfigKey = keyof AppConfig;

export interface ConfigContextValue {
  isLoaded: boolean;
  loadError: string | null;
  get<K extends ConfigKey>(key: K): AppConfig[K];
  set<K extends ConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}
