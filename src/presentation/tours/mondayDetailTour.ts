import type { DriveStep } from "driver.js";

export const mondayDetailTourSteps: DriveStep[] = [
  {
    element: '[data-tour="monday-header"]',
    popover: {
      title: "Conexão por token",
      description:
        "Cole seu token pessoal do Monday — em avatar → Developers → My access tokens. O modal de conexão traz o passo a passo com o link. O app se conecta direto à conta, sem OAuth.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="monday-boards"]',
    popover: {
      title: "Os dois boards",
      description:
        "A integração se apoia em dois boards. O de Portfólio lista os projetos: cada item vira um projeto e diz em qual quadro as horas dele são gravadas. O de Report de Horas é o catálogo dos rótulos — ele não recebe apontamento.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="monday-catalogs"]',
    popover: {
      title: "Projetos e catálogos",
      description:
        "Importe os projetos do Portfólio e os catálogos do Report. Cada projeto importado semeia as próprias categorias a partir dos Activity Types do quadro dele — você não precisa cadastrar nada à mão.",
      side: "bottom",
      align: "start",
    },
  },
  {
    element: '[data-tour="monday-autosync"]',
    popover: {
      title: "Envio automático",
      description:
        "'Por tarefa' envia ao concluir; 'Diário' agrupa e envia de uma vez, ao abrir o app ou em horário fixo — e 'Enviar agora' não espera o horário. Cada dia, projeto e tipo de cobrança vira uma atividade no quadro do projeto; reenviar atualiza a mesma atividade em vez de duplicar.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="monday-auto-import"]',
    popover: {
      title: "Importação automática",
      description:
        "Os itens atribuídos a você viram tarefas planejadas sozinhos. A lista de projetos se atualiza uma vez por dia, e item já importado não é reimportado.",
      side: "top",
      align: "start",
    },
  },
  {
    element: '[data-tour="monday-actions"]',
    popover: {
      title: "Enviar, importar e gerenciar",
      description:
        "'Enviar tarefas manualmente' escolhe o que vai virar atividade no quadro do projeto. 'Importar itens' traz itens como planejadas quando você quiser. 'Gerenciar atividades' edita ou exclui o que já foi enviado, sem sair do app.",
      side: "top",
      align: "start",
    },
  },
  {
    popover: {
      title: "Workspace do DeskClock",
      description:
        "Se você usa mais de um workspace, o Monday escolhe em qual deles trabalhar — é onde os projetos e as planejadas são criados, e de onde saem as horas enviadas. A escolha não depende do workspace aberto na tela.",
    },
  },
];
