import type { DriveStep } from "driver.js";

export const googleDetailTourSteps: DriveStep[] = [
  {
    element: '[data-tour="google-header"]',
    popover: {
      title: "Autenticação Google",
      description:
        "Uma única conta Google autoriza tanto o Sheets quanto o Calendar. Clique em 'Conectar com Google' para iniciar o OAuth — o app solicita apenas as permissões de Sheets, Calendar e email.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="google-sheets-section"]',
    popover: {
      title: "Google Sheets",
      description:
        "Cole o ID da planilha (trecho da URL entre /d/ e /edit) e o nome da aba onde as tarefas serão escritas. O app cria a aba se ela ainda não existir.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="google-sheets-columns"]',
    popover: {
      title: "Mapeamento de colunas",
      description:
        "Configure quais campos exportar, edite os rótulos das colunas e reordene-as arrastando pelo ícone de grip. Útil para alinhar com o layout de uma planilha já existente.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="google-sheets-autosync"]',
    popover: {
      title: "Sincronização automática",
      description:
        "'Por tarefa' envia ao concluir, em tempo real. 'Diário' agrupa e envia de uma vez — ao abrir o app ou em horário fixo — cobrindo fins de semana e dias não sincronizados.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="google-calendar-section"]',
    popover: {
      title: "Google Calendar",
      description:
        "Importe eventos da semana atual como tarefas planejadas. Reuniões de foco, home office e ausências são filtradas — apenas eventos de trabalho real são importados.",
      side: "top",
      align: "start",
    },
  },
];
