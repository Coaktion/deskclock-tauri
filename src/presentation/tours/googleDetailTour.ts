import type { DriveStep } from "driver.js";

export const googleDetailTourSteps: DriveStep[] = [
  {
    element: '[data-tour="google-header"]',
    popover: {
      title: "Autenticação Google",
      description:
        "Uma única conta Google autoriza o Sheets, o Calendar e o backup no Drive. Clique em 'Conectar com Google' para iniciar o OAuth — o app pede as permissões de Sheets, Calendar, Drive e email. Se você já usava o DeskClock antes desta versão, reconecte: o acesso ao Drive só entra num consentimento novo.",
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
      title: "Envio automático",
      description:
        "'Por tarefa' envia ao concluir, em tempo real. 'Diário' agrupa e envia de uma vez — ao abrir o app ou em horário fixo — cobrindo fins de semana e dias não enviados.",
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
  {
    element: '[data-tour="google-drive-backup"]',
    popover: {
      title: "Backup do banco",
      description:
        "Uma cópia do seu banco vai para uma pasta do seu Drive, na frequência que você escolher — e o backup vencido roda sozinho ao abrir o app. As cópias antigas são podadas. Use 'Fazer backup agora' para enviar na hora.",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: "Um workspace por integração",
      description:
        "Se você usa mais de um workspace, o Sheets e o Calendar escolhem cada um o seu — é onde as planejadas são criadas e de onde saem as tarefas exportadas. A escolha não depende do workspace aberto na tela.",
    },
  },
];
