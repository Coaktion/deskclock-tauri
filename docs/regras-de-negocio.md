# Regras de negócio — DeskClock

> Extraído da §6 do CLAUDE.md em 2026-08-10, verbatim. Leia ao mexer em tarefa em
> execução, billable, agrupamento, autocomplete, data de referência, workspace ou
> recorrência.

### 6.1 Tarefa em execução
- Apenas uma tarefa pode estar em execução por vez.
- Não é possível iniciar nova tarefa enquanto houver uma em execução — é necessário parar a atual primeiro.
- Timer começa imediatamente ao clicar "Iniciar", sem exigir dados.
- Pausar preserva a duração acumulada. Retomar continua de onde parou.

### 6.2 Billable
- Ao selecionar uma Categoria, o campo billable é preenchido com `category.default_billable`.
- O usuário pode sobrescrever manualmente a qualquer momento.
- Na lista de entradas, um clique no indicador billable alterna o valor.

> **O faturamento é do grupo, não da tarefa solta.** `billable` não compõe a chave de agrupamento
> (§6.3), então irmãs podem divergir nele — e o cabeçalho do grupo, que mostra o valor da primeira,
> passa a mentir sobre as outras sem nada na tela avisando. Por isso alternar numa linha alterna em
> todas as irmãs (`setGroupBillable`), o chip do **cabeçalho** também alterna o grupo inteiro, e o
> `EditTaskModal` propaga para o grupo o valor que salvou — inclusive quando a edição mudou o nome e
> a tarefa passou a pertencer a outro grupo, cujo valor ela leva consigo. O recorte das irmãs é o dia
> e o workspace da tarefa, entre as **concluídas**: é onde o grupo existe, e uma execução em curso com
> o mesmo nome não está nele. Grupo já uniforme não gera escrita — a regra só age onde havia divergência.

### 6.3 Agrupamento de tarefas
- Critério: Nome + Projeto + Categoria idênticos.
- Agrupamento é apenas visual — os registros permanecem independentes no banco.
- Unificar: cria um registro com duração somada e exclui os originais.

### 6.4 Autocomplete
- Filtra conforme digitação.
- Enter com dropdown aberto: seleciona o primeiro item filtrado.
- Enter com dropdown fechado (ou sem resultados): submete o formulário (§8.2). Havendo `onEnter`, dispara ele em vez disso.
- Dropdown fecha ao perder foco (`onBlur`).
- Permite texto livre se nenhum resultado — não cria projeto/categoria automaticamente.

> **A lista se dimensiona pelo conteúdo, não pelo campo.** Presa à largura do campo (`w-full`),
> ela espremia nomes de projeto e categoria a ponto de quebrá-los em duas ou três linhas — e os
> campos mais estreitos são justamente os das telas com mais opções a ler (os editores por linha
> dos modais de importação, a coluna do Planejamento, o popup de 264 px). Agora é `w-max` com
> `min-w-full`: cresce até o nome mais longo e nunca fica menor que o campo.
>
> **O teto é medido na abertura** (`measureListBox`), porque a lista é `absolute` e nada em CSS
> sabe a que distância ela está da borda da janela — é isso que impede um `min-width` de resolver
> sozinho: no campo encostado à direita ele a jogaria para fora da tela. Sobrando menos de 14rem à
> direita e havendo mais espaço à esquerda, ela **alinha à direita** e cresce para o outro lado;
> alinhar à esquerda continua sendo o padrão, ou o campo um pouco depois do meio da tela abriria a
> lista para o lado errado sem que faltasse espaço nenhum. O teto absoluto é 24rem — sem ele, uma
> única opção comprida abriria um painel da largura da janela.
>
> A medição é só na abertura: com a lista aberta, o clique fora a fecha, e o campo só se move com a
> janela sendo redimensionada.

> **O autocomplete de categoria depende do projeto escolhido.** Tendo o projeto ao menos uma
> associação em `project_categories` (§5.6), o campo oferece **só** as associadas; **conjunto vazio
> devolve o catálogo inteiro**, e é essa regra — em `resolveCategoriesForProject` — que torna o
> filtro duro seguro: projeto sem associação, que é o estado de todos até alguém popular a tabela,
> continua oferecendo tudo. Vale em **14 pontos de entrada**; o **Histórico fica de fora**, porque
> ali o campo é filtro de busca e restringi-lo esconderia tarefas já gravadas.
>
> **O recorte vale só para as `options`.** Toda busca que resolve um valor **já existente** — o nome
> exibido da categoria da tarefa em execução, o casamento por nome do import do Monday — continua no
> catálogo cheio: o filtro governa o que se pode escolher, nunca o que o app pode mostrar. Sem essa
> separação, desassociar uma categoria apagaria o nome dela das tarefas que já a usam.
>
> **Trocar o projeto zera a categoria** (escolha do usuário, por consistência). O reset vive no
> `onSelect` do autocomplete de projeto — e, onde o código já zerava o id, no campo esvaziado. Nunca
> num `useEffect` keyed em `projectId`: `prefill`, os três modais de importação e o reexecutar de uma
> entrada preenchem projeto e categoria **juntos**, e o efeito apagaria a categoria recém-chegada. E
> nunca no `onChange`, que dispara a cada tecla. No popup, onde editar o chip grava na hora, o reset
> vai no mesmo `onUpdateTask({ projectId, categoryId: null })`.
>
> O mapa é carregado **uma vez por tela** (`useProjectCategoryMap`), não por projeto: três dos pontos
> de entrada são modais de importação que renderizam um editor por item, e um hook por linha viraria
> dezenas de consultas para montar uma tela só. Ali o recorte desce como `categoryOptionsFor`.

### 6.5 Ações de tarefa planejada
- Ao iniciar uma tarefa planejada via Play, as ações configuradas **não são executadas automaticamente**. Elas ficam como chips clicáveis enquanto a tarefa estiver em execução, e o usuário dispara cada uma sob demanda (e mais de uma vez, se quiser). Onde os chips aparecem está em `docs/telas/overlays.md` — a faixa que abre no hover do card.
- **A ação tem nome, e o nome é opcional** (`PlannedTaskAction.label`, 2026-08-13). Sem ele o chip deriva o rótulo do próprio valor, que é o que toda ação criada antes do campo mostra: hostname na URL, nome do arquivo no caminho. Nome só de espaços não conta como nome. A coluna `actions` é JSON, então não houve migration e linha antiga lê com o campo ausente.
- **Integração nomeia pelo destino, nunca pela entidade de origem** (`actionDestinationLabel`): Meet, Zoom, Teams, Google Agenda, Monday e Zendesk, cobrindo subdomínio (`us02web.zoom.us`, `aktienow.monday.com`, `coaktion.zendesk.com`). **São três as integrações que criam ação** — Agenda, Monday e Zendesk —, e as três passam pelo `openUrlAction`, que traz junto a guarda de URL vazia. A razão é de tela e não de gosto — a planejada importada **já nasce com o nome do evento ou do item** (`name: event.title`, `name: item.name`), então nomear a ação com o mesmo texto faria o chip ecoar, uma linha acima, o nome que o card do popup mostra logo abaixo. "Meet" diz o que o nome da reunião não diz, e é o que separa na tela o par que o `conferenceLink ?? htmlLink` já separa no código — para o que a tabela precisa das **duas** formas do link da Agenda: o `htmlLink` real da API v3 é `www.google.com/calendar/event`, não `calendar.google.com`. A entrada larga (`google.com`) só vale com o prefixo de caminho `/calendar`, e vem **depois** das específicas: sem isso, todo link do Meet — que termina em `.google.com` — viraria "Google Agenda". **Host desconhecido não ganha nome**: sem ele o chip deriva do valor, e inventar um aqui daria duas fontes para a mesma string.
- Cada chip mostra um ícone (globo para URL, pasta para arquivo) e o rótulo, com teto de largura — nome escrito à mão é mais largo que o hostname que substitui, e o card do popup tem 264 px úteis. O valor inteiro fica no `title`.
- `open_url`: Abre URL no navegador padrão. Auto-prepend `https://` se não contiver `http://` ou `https://`.
- `open_file`: Abre arquivo/pasta no explorador de arquivos do SO.

### 6.6 Data de referência da tarefa
- A data de uma tarefa é sempre a **data local do `startTime`** (menor horário).
- Tarefas que cruzam meia-noite (início em um dia, fim no seguinte) pertencem ao dia de início.
- Toda lógica de agrupamento por dia (histórico, lançamento retroativo) extrai a data no fuso local do usuário — nunca faz `.slice(0, 10)` direto no ISO UTC.
- As funções `startOfDayISO(dateISO)` e `endOfDayISO(dateISO)` constroem limites UTC a partir do horário local: `new Date(dateISO + "T00:00:00").toISOString()`.

### 6.7 Workspaces
- Todo registro nasce no **workspace ativo**, lido do `WorkspaceContext`. Nenhum hook recebe workspace por parâmetro — é isso que mantém as assinaturas públicas estáveis.
- `findAll(workspaceId?)` e afins tratam `undefined` como "todos os workspaces". **Nenhuma
  integração usa mais esse caminho:** cada uma escolhe o seu workspace do DeskClock em
  Integrações (`mondayDeskclockWorkspaceId` e irmãs) e escopa por ele, inclusive o
  `useTaskSendSelection`, que dependia do contrário de propósito. Vazio resolve para o "Padrão"
  na leitura (`resolveIntegrationWorkspaceId`), sem gravar nada — quem tem um workspace só não
  vê seletor nenhum e não percebe a mudança. A exceção é o rastreio automático de reuniões da
  Agenda, que continua criando no ativo (§5.7).
- `findByName(name, workspaceId)` exige o parâmetro: a unicidade de projeto e categoria é por workspace.
- **Trocar de workspace com tarefa em execução é bloqueado** — a UI oferece "parar e trocar" reusando a pergunta Concluída/Pendente. A guarda vive em `useWorkspaceSwitchGuard`, não em `switchTo`, porque o `RunningTaskContext` já consome o `WorkspaceContext` e o caminho inverso fecharia um ciclo.
- Cada janela tem seu próprio `WorkspaceProvider`; o evento `WORKSPACE_CHANGED` mantém todas em sincronia.
- **Exclusão de workspace exige confirmação**, contrariando o §1. É deliberada, e a regra que a
  justifica vale para as duas exceções que existem (a outra é apagar atividade no Monday, §5.7): o
  que se apaga não é do DeskClock ou não tem como ser refeito.
- **O modal de exclusão avisa quais integrações param junto** (`integrationsBoundToWorkspace`).
  Excluído o workspace, a chave da integração aponta para um id que não existe mais e ela **para
  em silêncio** — a busca não devolve nada e não há erro a exibir. O aviso **não impede**: quem
  quer excluir segue em frente e escolhe outro workspace em Integrações depois. Duas sutilezas que
  são o ponto do aviso: **integração não conectada fica de fora** (alarme falso ensina a ignorar o
  aviso) e **apagar o "Padrão" leva junto toda integração com a chave vazia**, que a tela de
  Integrações não mostra como vinculada — essas aparecem com a ressalva "usa o Padrão".

### 6.8 Tarefas recorrentes
- Sem data de término — aparecem indefinidamente nos dias configurados.
- Excluir remove a tarefa completamente de todos os dias futuros.
- Concluir afeta apenas o dia atual (adiciona data ao `completed_dates`).

---

