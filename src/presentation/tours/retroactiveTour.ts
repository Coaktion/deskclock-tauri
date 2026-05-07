import type { DriveStep } from "driver.js";

export const retroactiveTourSteps: DriveStep[] = [
  {
    element: '[data-tour="retroactive-header"]',
    popover: {
      title: "Navegação por data",
      description:
        "Use as setas para mudar o dia. Não é possível avançar além de hoje. O total de horas do dia aparece no cabeçalho quando há registros.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="retroactive-form"]',
    popover: {
      title: "Formulário de lançamento",
      description:
        "Informe nome, projeto e categoria. Depois defina os horários de início e fim — ou a duração diretamente. Pressione Enter ou clique em Adicionar para salvar.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="retroactive-timeinputs"]',
    popover: {
      title: "Início em sequência",
      description:
        "Após adicionar uma tarefa, o campo Início da próxima é preenchido automaticamente com o fim da anterior — ideal para lançar o dia inteiro em sequência.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="retroactive-task-list"]',
    popover: {
      title: "Tarefas do dia",
      description:
        "Os registros do dia selecionado aparecem ordenados do mais recente para o mais antigo. Você pode editar ou excluir qualquer um.",
      side: "top",
      align: "start",
    },
  },
];
