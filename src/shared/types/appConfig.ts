import type {
  ClockifyCategoryMapping,
  ClockifyProjectMapping,
  ClockifyWorkspaceRef,
} from "@shared/types/clockifyConfig";
import type { MondayFieldCatalogs, MondayProjectMapping } from "@shared/types/mondayConfig";
import type { SheetColumnMapping } from "@shared/types/sheetsConfig";
import type { RoundingSlot } from "@shared/utils/roundDuration";

export interface OverlayPosition {
  x: number;
  y: number;
}

/** Periodicidade do backup do banco no Drive. Contada por intervalo desde o último sucesso. */
export type BackupFrequency = "daily" | "weekly" | "monthly";

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
  /**
   * Modo e acento são eixos independentes. Vazio significa "nunca escolhido" e
   * é migrado do `theme` legado na leitura (`resolveAppearance`), sem gravar
   * nada — quem nunca abrir Aparência não percebe a mudança.
   */
  mode: "" | "escuro" | "claro";
  accent: "" | "azul" | "verde" | "roxo" | "ambar";
  /** @deprecated Substituído por `mode` + `accent`; só é lido para migrar. */
  theme: "azul" | "verde" | "escuro" | "claro";
  // Atalhos globais
  shortcutToggleTask: string;
  shortcutStopTask: string;
  shortcutToggleOverlay: string;
  shortcutToggleWindow: string;
  // Overlay
  overlayAlwaysVisible: boolean;
  overlayShowOnStart: boolean;
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
  // Backup do banco no Google Drive
  driveBackupEnabled: boolean;
  driveBackupFrequency: BackupFrequency;
  /**
   * Pasta "DeskClock Backups" no Drive do usuário. Vazio = ainda não criada; o
   * cliente cria na primeira execução e persiste o id aqui. Ela é **visível**
   * de propósito: baixar o backup sem passar pelo app é o motivo de ele existir.
   */
  driveBackupFolderId: string;
  /**
   * Instante do último backup bem-sucedido. `0` = nunca. É daqui que sai o
   * vencimento — não há âncora de calendário, então não há borda de dia 31 e o
   * backup vencido roda assim que o app abre.
   */
  driveBackupLastRunAt: number;
  /** Falha do último ciclo, exibida na subseção. "" quando correu bem. */
  driveBackupLastError: string;
  /** Quantos arquivos ficam na pasta; o excedente é podado após cada envio. */
  driveBackupKeepCount: number;
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
  // Provedor de LLM
  /**
   * Preset escolhido no catálogo (`src/infra/integrations/llm/providers.ts`), ou
   * `"custom"`. Serve para a tela saber qual linha destacar; quem manda na
   * chamada são as três chaves abaixo.
   */
  llmProviderId: string;
  /**
   * `baseUrl` e `model` são texto livre, e não uniões, porque **quem escolhe o
   * provedor é o usuário**: o catálogo é sugestão semeada na tela, não a lista
   * do que pode existir. Provedor compatível com OpenAI que ninguém previu —
   * um Ollama noutra porta, um gateway interno — só precisa de uma URL, e
   * modelo novo aparece no fim de semana sem release do DeskClock.
   */
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  /**
   * O resumo do último dia trabalhado, guardado para não gastar uma requisição
   * a cada visita à tela de Tarefas — o free tier do Groq dá 30 por minuto e
   * 1000 por dia, e a tela é a que mais se abre no app.
   *
   * `llmSummaryDate` é o dia **resumido**, não o dia em que se gerou: é ele que
   * a seção escreve no título, e é comparando-o com o último dia com tarefas
   * que se sabe se o texto ainda vale.
   *
   * O workspace entra na chave porque o resumo descreve as tarefas daquele
   * escopo: sem ele, trocar de workspace mostraria o texto do outro.
   */
  llmSummaryDate: string;
  llmSummaryText: string;
  llmSummaryWorkspaceId: string;
  //
  // Não há `llmDeskclockWorkspaceId`, e a ausência é deliberada: o §9.5 item 7
  // (cada integração escolhe o seu workspace) não se aplica aqui. As outras
  // integrações escrevem em sistemas externos e precisam saber de onde tirar as
  // tarefas; o resumo descreve **as tarefas que o usuário está vendo na tela**,
  // então segue o workspace ativo, como a própria tela de Tarefas. Dar-lhe um
  // workspace próprio produziria resumo de tarefas que não estão à vista.
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
