import type { DriveStep } from "driver.js";

export const clockifyDetailTourSteps: DriveStep[] = [
  {
    element: '[data-tour="clockify-header"]',
    popover: {
      title: "Conexão via API Key",
      description:
        "Cole sua API Key do Clockify — encontrada em Perfil → Configurações de perfil → API. O app se conecta diretamente ao workspace sem OAuth.",
      side: "bottom",
      align: "start",
    },
  },
  {
    popover: {
      title: "Workspace do Clockify",
      description:
        "Após conectar, selecione o workspace do Clockify onde as entradas de tempo serão registradas. Você pode alternar entre workspaces sem precisar desconectar.",
    },
  },
  {
    popover: {
      title: "Workspace do DeskClock",
      description:
        "Se você usa mais de um workspace aqui no DeskClock, o Clockify escolhe de qual deles saem as horas enviadas. A escolha é da integração, e não muda quando você troca o workspace aberto na tela.",
    },
  },
  {
    popover: {
      title: "Mapeamentos de projetos e categorias",
      description:
        "Vincule seus projetos do DeskClock aos projetos do Clockify, e suas categorias às tags. Use 'Importar do Clockify' para criar os vínculos automaticamente a partir dos dados do workspace.",
    },
  },
  {
    popover: {
      title: "Tags padrão",
      description:
        "Defina tags adicionadas em todos os envios, independente da categoria da tarefa. Útil para identificar no Clockify as entradas vindas do DeskClock.",
    },
  },
  {
    popover: {
      title: "Sincronização e envios",
      description:
        "Ative a sincronização automática ('Por tarefa' ou 'Diária') ou use 'Enviar tarefas manualmente' para selecionar o que enviar. 'Gerenciar apontamentos' permite editar entradas existentes no Clockify sem sair do app.",
    },
  },
];
