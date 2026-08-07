import type { DriveStep } from "driver.js";

export const planningTourSteps: DriveStep[] = [
  {
    element: '[data-tour="planning-header"]',
    popover: {
      title: "Visão semanal",
      description:
        "Navegue entre semanas com as setas. A pílula 'Semana atual' fica acesa quando você está na semana de hoje e traz você de volta a ela de qualquer outra. O contador à direita mostra quantas tarefas já foram concluídas na semana.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="planning-day-filter"]',
    popover: {
      title: "Filtro por dia",
      description:
        "Clique em um dia da semana para focar nele. O formulário de criação preencherá a data automaticamente.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="planning-form"]',
    popover: {
      title: "Criar tarefa planejada",
      description:
        "Adicione tarefas com nome, projeto e categoria. Escolha entre data única, recorrente (dias da semana) ou período com início e fim.",
      side: "right",
      align: "start",
    },
  },
  {
    element: '[data-tour="planning-task-list"]',
    popover: {
      title: "Lista de tarefas",
      description:
        "Cada tarefa pode ser iniciada, concluída, duplicada ou excluída. Tarefas recorrentes aparecem em todos os dias configurados. Use 'Selecionar tarefas', acima da lista, para excluir várias de uma vez.",
      side: "left",
      align: "start",
    },
  },
];
