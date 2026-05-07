import type { DriveStep } from "driver.js";

export const planningTourSteps: DriveStep[] = [
  {
    element: '[data-tour="planning-header"]',
    popover: {
      title: "Visão semanal",
      description:
        "Navegue entre semanas com as setas. O contador à direita mostra quantas tarefas já foram concluídas na semana. Use o botão 'Selecionar tarefas' para selecionar múltiplas e excluí-las em massa.",
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
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="planning-task-list"]',
    popover: {
      title: "Lista de tarefas",
      description:
        "Cada tarefa pode ser iniciada, concluída, duplicada ou excluída. Tarefas recorrentes aparecem em todos os dias configurados.",
      side: "top",
      align: "start",
    },
  },
];
