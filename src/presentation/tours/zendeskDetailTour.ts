import type { DriveStep } from "driver.js";

export const zendeskDetailTourSteps: DriveStep[] = [
  {
    element: '[data-tour="zendesk-header"]',
    popover: {
      title: "Autenticação OAuth",
      description:
        "O Zendesk usa OAuth. Antes de conectar, crie um OAuth client no Admin Center do seu Zendesk. As instruções detalhadas aparecem na seção de credenciais abaixo.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="zendesk-credentials"]',
    popover: {
      title: "Credenciais OAuth",
      description:
        "Informe o subdomínio (ex: 'minha-empresa' para minha-empresa.zendesk.com), o Client ID e o Secret. Na URL de redirecionamento do client, adicione exatamente: http://localhost:27422/callback.",
      side: "bottom",
      align: "start",
    },
  },
  {
    popover: {
      title: "Importação de tickets",
      description:
        "Após conectar, o botão 'Importar tickets' aparece. Você escolhe quais tickets abertos importar como tarefas planejadas, com filtros de organização e tipo de ticket.",
    },
  },
  {
    popover: {
      title: "Tickets no Planejamento",
      description:
        "Tickets importados aparecem na tela de Planejamento. Reimportar não duplica — tickets já adicionados são reconhecidos e ignorados.",
    },
  },
  {
    popover: {
      title: "Workspace do DeskClock",
      description:
        "Se você usa mais de um workspace, o Zendesk escolhe em qual deles as planejadas são criadas. A escolha é da integração, e não muda quando você troca o workspace aberto na tela.",
    },
  },
];
