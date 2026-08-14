import type { DriveStep } from "driver.js";

export const dataTourSteps: DriveStep[] = [
  {
    element: '[data-tour="data-header"]',
    popover: {
      title: "Os cadastros do app",
      description:
        "Projetos, categorias, workspaces e campos personalizados moram aqui. Cada aba traz o contador do que já existe, e é desta tela que sai quase tudo que os formulários oferecem nas outras.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="data-panel"]',
    popover: {
      title: "Workspaces",
      description:
        "Um workspace separa projetos, categorias e apontamentos dos demais — útil para dividir clientes ou frentes que não devem se misturar. Na aba Workspaces, 'tornar ativo' troca o que o app inteiro enxerga.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="data-panel"]',
    popover: {
      title: "Projetos e categorias",
      description:
        "Cada projeto ganha uma cor, que o identifica nas listas e no overlay. Você pode associar categorias a um projeto: feito isso, o autocomplete de categoria passa a oferecer só as dele.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="data-panel"]',
    popover: {
      title: "Campos personalizados",
      description:
        "Crie campos próprios — texto ou lista de opções — para preencher em tarefas e planejadas. Integrações como o Monday semeiam os campos que os quadros delas exigem.",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: "Cadastro em massa e limpeza",
      description:
        "O botão 'Importar', no cabeçalho, cria projetos ou categorias de uma vez, um por linha. Para o caminho inverso, 'Selecionar todos' abre a exclusão em massa.",
    },
  },
];
