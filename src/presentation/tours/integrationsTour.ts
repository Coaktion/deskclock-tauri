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
    element: '[data-tour="integrations-monday-tile"]',
    popover: {
      title: "Monday",
      description:
        "Envie suas horas como atividades nos quadros de projeto do Monday, e traga os itens atribuídos a você como tarefas planejadas. Os projetos e as categorias vêm dos próprios quadros.",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: "Cada integração no seu workspace",
      description:
        "Se você usa mais de um workspace, cada integração escolhe em qual deles trabalhar — é onde ela cria projetos e planejadas, e de onde saem as horas que ela envia. A escolha é dela, e não muda quando você troca o workspace aberto na tela.",
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
