import type { DriveStep } from "driver.js";

export const integrationsTourSteps: DriveStep[] = [
  {
    element: '[data-tour="integrations-list"]',
    popover: {
      title: "Integrações disponíveis",
      description:
        "Conecte o DeskClock a ferramentas externas. Clique em qualquer bloco para acessar a configuração detalhada da integração.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="integrations-google-tile"]',
    popover: {
      title: "Google (Sheets + Calendar)",
      description:
        "Uma única conta Google dá acesso ao Sheets — para exportar tarefas automaticamente — e ao Google Calendar, para importar eventos como tarefas planejadas.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="integrations-clockify-tile"]',
    popover: {
      title: "Clockify",
      description:
        "Registre suas entradas de tempo diretamente no Clockify. Mapeie projetos e categorias do DeskClock para os equivalentes no seu workspace do Clockify.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="integrations-zendesk-tile"]',
    popover: {
      title: "Zendesk",
      description:
        "Importe tickets do Zendesk como tarefas planejadas, com filtros por organização e tipo de ticket.",
      side: "bottom",
      align: "start",
    },
  },
  {
    popover: {
      title: "Sincronização automática",
      description:
        "Após conectar uma integração, configure o envio automático nas configurações dela: por tarefa (envia em tempo real ao concluir) ou diário (agrupa e envia de uma vez no horário definido).",
    },
  },
];
