import type { DriveStep } from "driver.js";

export const tasksTourSteps: DriveStep[] = [
  {
    element: '[data-tour="tasks-greeting"]',
    popover: {
      title: "Sua tela principal",
      description:
        "Esta tela centraliza tudo do seu dia: tarefa em execução, tarefas planejadas e os registros feitos até agora.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="tasks-omnibox"]',
    popover: {
      title: "Caixa de tarefa",
      description:
        "Digite o nome do que vai fazer e pressione Enter (ou clique no botão play) para iniciar. Você pode adicionar projeto, categoria e indicar se é billable antes de começar.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="tasks-planned-section"]',
    popover: {
      title: "Tarefas planejadas para hoje",
      description:
        "Tarefas que você programou para este dia aparecem aqui. Clique no botão de play em qualquer uma para iniciá-la instantaneamente.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="tasks-totals"]',
    popover: {
      title: "Resumo do dia",
      description:
        "Acompanhe horas billable, non-billable, total de hoje e progresso da semana em relação às suas metas configuradas.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="tasks-entries"]',
    popover: {
      title: "Registros de hoje",
      description:
        "Todas as tarefas concluídas hoje ficam aqui. Tarefas com mesmo nome e projeto são agrupadas — você pode editar, excluir, repetir ou mesclar o grupo.",
      side: "top",
      align: "start",
    },
  },
];
