# 5.3 Tela de Planejamento

> Extraído da §5.3 do CLAUDE.md em 2026-08-10, verbatim.

### 5.3 Tela de Planejamento

> **Decisão de produto:** A visão "Hoje" foi removida. A visão Semana já permite selecionar qualquer data (incluindo hoje) e é suficiente para todos os fluxos de planejamento.

- **Header:** Intervalo da semana (ex: "06/04 — 12/04/2026") + navegação ← → + pílula "Semana atual" + contador de concluídas.
- **A pílula "Semana atual" é botão e indicador ao mesmo tempo**, no lugar que era do botão de importar da Agenda. Navegadas algumas semanas, o intervalo em dd/mm não responde sozinho "esta é a de hoje?" — a pílula **acesa** é a resposta, e **apagada** é o caminho de volta em um clique. Fica sempre visível, e não desabilita na semana atual. É o **último atalho desse tipo**: a pílula "Hoje" do campo Data única saiu (ver abaixo), e ali quem responde "que dia é" é o próprio campo, sempre preenchido. Volta também o filtro de dia para "Todos", como as setas.
- **Layout em duas colunas:** formulário fixo à esquerda (`PlannedTaskForm`), semana à direita — o mesmo arranjo do Lançamento Manual (§5.8). As duas telas de entrada compartilham o vocabulário visual dos campos em `presentation/components/fieldStyles.ts`; **não duplicar essas classes**, ou um ajuste numa tela desalinha a outra em silêncio.
- **A coluna do formulário recolhe** (`CollapsibleFormColumn`, o mesmo componente do Lançamento Manual): sobra uma faixa de 36 px com o rótulo de pé, e a lista fica com a tela inteira. O estado é **persistido** por tela (`planningFormCollapsed`, `retroactiveFormCollapsed`) — quem recolheu quer espaço para trabalhar, e reabrir a cada navegação desfaria o pedido. Não há toggle em Configurações: o controle é o próprio botão da coluna. O `data-tour` vive na casca, não no formulário, para o tour ter alvo mesmo com a coluna recolhida.
- **E ela é arrastável**, pelo divisor à direita (`useResizablePanel` + `ResizeHandle`), entre 224 e 560 px, com o padrão em 256 px — a largura que ela tinha fixa, então quem nunca arrastar não vê diferença. A largura mora em **outra chave** (`planningFormWidth`, `retroactiveFormWidth`), e é isso que faz a coluna reabrir na largura de antes.

> **O divisor é a borda, e a base é reaproveitável.** O `formColumnShellClass` deixou de trazer
> `w-64` e `border-r`: a largura é escolha do usuário (classe do Tailwind é estática e não a
> expressa) e a linha passou a ser o próprio `ResizeHandle`, ou haveria linha dupla. A área de
> clique é 4 px para cada lado de um traço de 1 px — traço grosso o bastante para pegar seria um
> risco permanente no meio da tela.
>
> Três decisões do hook: o arraste usa **pointer capture**, não listener no `document`, então sair
> da janela no meio do gesto não o perde e não há par de listeners para remover em cada caminho de
> saída; **persistir é no soltar**, porque `config.set` grava no SQLite e um `UPDATE` por quadro é
> o custo mais fácil de evitar; e **arrastar 40 px abaixo do mínimo recolhe** — a folga existe
> porque o mínimo é o destino mais procurado do arraste, e recolher ali sem querer seria comum.
> Recolher assim **não** persiste a largura encolhida: o gesto pediu para sumir, não para reabrir
> espremido.
>
> **A geometria é uma prop só, `anchor` (`left` | `right` | `top` | `bottom`)**, e dela saem o
> eixo, o sinal (crescer é para longe da borda), o cursor, quais setas respondem e a orientação
> ARIA. Duas props — eixo e sentido — abririam a chance de combiná-las ao contrário. O
> `ResizeHandle` lê o eixo do **próprio `aria-orientation`**, que já vem no `handleProps`: não
> existe um segundo lugar onde errar o eixo, e o desenho não tem como discordar do gesto.
>
> Teclado e leitor de tela vêm junto: `role="separator"` com os limites, setas **do próprio eixo**
> ajustando de 16 em 16 px (consumir a seta do eixo alheio roubaria a tecla de quem navega a tela),
> `Home` e duplo clique voltando ao padrão.

- **Dias úteis por padrão, semana inteira sob configuração.** Sábado e domingo não aparecem no planejamento a menos que **Exibir fim de semana** (`showWeekend`, na seção Jornada das Configurações) esteja ligada — desligada é o padrão. `recurringDays` continua na escala do `Date` (0=Dom…6=Sáb): a lista de dias da recorrência oferece 1 a 5, ou 0 a 6 com a config ligada, mas **não** reindexe os valores, ou toda tarefa recorrente já gravada muda de dia. A lista sai de `weekdayOptions(showWeekend)` (`shared/utils/weekdays.ts`), fonte única dos quatro editores de planejada — copiá-la de volta deixa um deles oferecendo cinco dias em silêncio.

> **A regra vale também na entrada, e o import da Agenda era o único lugar que ainda não a
> cumpria.** Ele listava a semana inteira e oferecia os sete dias na recorrência, então o evento de
> sábado nascia planejada sem dia onde aparecer. Com **Exibir fim de semana** ligada o import passa
> a cobrir os sete dias — a semana da barra lateral, o rótulo do período e o descarte na origem
> leem a mesma config. O descarte é **na origem** — a lista de eventos
> logo depois da busca —, não só na renderização dos dias: escondido mas presente na lista, o evento
> continuava selecionado por padrão, entrava na contagem do botão e era importado do mesmo jeito. Os
> dias sugeridos pela recorrência do Google são aparados pela mesma régua, ou a série que repete às
> segundas e aos sábados guardaria um `6` que a lista de dias não mostra nem permite desmarcar.

- **Botões rápidos de dia:** Todos | Seg | Ter | Qua | Qui | Sex — mais Sáb e Dom com o fim de semana ligado —, no topo da coluna da direita. Ao clicar em um dia, filtra a lista e preenche o campo Data do formulário automaticamente.
- **Barra de seleção:** "Selecionar tarefas" fica na **mesma linha dos botões de dia**, encostado à direita (`ml-auto`) — não no header, e só aparece havendo ao menos uma tarefa. Uma linha só para a barra custava altura que é da lista. Com o fim de semana ligado são sete pílulas e o grupo rola horizontalmente; a rolagem fica no grupo das pílulas, não na linha: na linha, os botões de seleção sairiam da tela junto com os dias.
- **Formulário inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, campos personalizados, agendamento e ações — empilhados na coluna.
- **Campo Data única já nasce preenchido, e não tem atalho "Hoje".** O botão dizia duas coisas ao mesmo tempo — "a data é hoje" e "leve a data para hoje" —, e aceso lia como filtro. No lugar dele, o campo abre com o dia navegado (ou com hoje, sem um) nesta coluna, e com hoje nos dois formulários de edição quando a tarefa não tem data gravada (`usePlannedTaskEditor`). **Data já gravada não é sobrescrita**: alternar para "Recorrente" e voltar devolve o dia escolhido.
- **Tipos de agendamento:**
  - `specific_date`: Dia único. Campo data preenchido de saída.
  - `recurring`: Seleção de dias da semana. Sem data de término. Aparece até ser excluída.
  - `period`: Data início + Data fim. Aparece durante todo o período.
- **Ações por tarefa:** Array de `{ type: "open_url" | "open_file", value: string, label?: string }`. URL auto-completa `https://` se ausente. N ações por tarefa. As ações não são disparadas automaticamente ao iniciar. Elas se alcançam **sem iniciar a tarefa e sem abrir a edição**, pela seção que abre o menu ⋯ da própria linha — e o clique direito (aqui e na lista do popup): uma ação é o item, clicável direto; duas ou mais viram o submenu "Ações". Continuam disponíveis como chips durante a execução — no card do popup, no omnibox e no `RunningTaskEditSheet` (ver §6.5). **O ⚡ que ficava na linha saiu na H1** do spec `acoes-da-linha-planejada.md`, e com ele a disputa de largura com o chip e a duração. **No modo de seleção o menu some**, pelo mesmo motivo que o Play: ali a linha inteira é alvo de marcar, e um controle que engole o clique faria a tarefa recusar a seleção justamente enquanto se escolhe o que excluir em lote.
- **O sub-formulário de ação tem uma grafia só**, o `PlannedActionsField`, e é ele que serve as três telas que editam ações: esta coluna, o `EditPlannedTaskModal` e o `PlannedTaskEditSheet` do popup. Estava escrito três vezes e as três já discordavam (`text-purple-400` cru no glifo de arquivo em duas, três controles de remover, três de adicionar), mas o que cobrava caro era outra coisa: acrescentar um campo custava três edições em **dois** donos de estado, porque o `PlannedTaskForm` guardava o seu próprio par `newActionType`/`newActionValue` em vez do `usePlannedTaskEditor` — que hoje expõe só `actions`/`setActions`. O `compact` empilha o tipo acima do valor para as duas colunas estreitas (280 px aqui, 264 no painel), no mesmo eixo do `CustomFieldInputs`; **o rótulo da seção fica no call site**, porque os três dizem coisas diferentes e aqui ele carrega junto o divisor que quebra a coluna em blocos. A ordem dos campos é a da leitura — que tipo é, como se chama, para onde aponta —, com o acrescentar encostado no último, que é onde o Enter cai depois de digitar o valor.
- **Tecla Enter:** Se autocomplete fechado → cria a tarefa. Se autocomplete aberto → seleciona item.
- **Edição:** abre modal completo, pelo **clique na linha** (fora do modo de seleção) ou pelo item Editar do menu.
- **Ações da linha:** círculo de concluir à esquerda, **Play fixo** na última coluna (vazia, mas reservada, na concluída do dia e no modo de seleção), e só o **⋯**, sempre visível (H2). O ⋯ e o clique direito abrem o mesmo menu (Editar, Duplicar, Copiar link, Excluir), e a linha focada aceita atalhos. Excluir continua sem confirmação, mas o toast traz **Desfazer** (e `Ctrl+Z`). O desenho, os gestos, o teclado e o desfazer estão em `docs-internal/specs/acoes-da-linha-planejada.md`; **leia antes de mexer na linha**, porque ali estão também as divergências declaradas do wireframe 3e.
- **Copiar link não abre nada.** Monta o `deskclock://task/share` da tarefa (`plannedTaskToSharePayload` + `buildShareLink`), escreve na área de transferência e avisa por toast: é uma ação de um clique só, e um modal para mostrar o endereço só acrescentaria o clique de fechar. Até 2026-09-18 se chamava "Compartilhar". O que o link leva e o que ele deliberadamente deixa para trás (agendamento, recorrência, data, ações, ids) está em `docs-internal/specs/compartilhar-tarefa.md`; a linha da planejada é a **única** origem de link no app, e a chegada não é aqui — é o modal que o deeplink abre, de qualquer tela.
- **O chip de faturamento fica parado.** A ordem da direita é `⋯ · chip · duração · ▶` (H2): o ⋯ tem coluna própria e **sempre visível** antes do chip, e o Play fica por último, numa coluna reservada mesmo na tarefa concluída. Nada ali cresce no hover, então nada anda — antes a célula do ⋯ abria em largura, e com o chip à frente dela ele saltava no instante em que o cursor entrava na linha. Desde que o chip virou controle (`bbb4a1b`), posição estável é requisito, não acabamento.
- **Importar Google Agenda:** **não se entra por aqui.** O botão que ficava ao lado da navegação de semana foi removido — o modal abre pelo rail de integrações e pela tela de Integrações, que é onde está o seletor de workspace que governa o destino do import (§5.7). Ter dois caminhos para o mesmo modal era justamente o que fazia o import nascer num workspace diferente do que o Planejamento mostra na tela.

#### Realce da tarefa em execução

- **A linha que está rodando se acende**, e o realce é um par: um ponto de 6px **ao lado do nome**,
  na mesma fileira das marcas de recorrência e do sino (a de execução vem primeiro), e a faixa
  inteira tingida. Nenhum dos dois basta sozinho — o fundo em 5% não se lê como estado por quem não
  distingue o tom, e o ponto sozinho some numa lista cheia.
- **Em execução e pausada são estados distintos, não um mais fraco que o outro.** Em execução: ponto
  em `accent` **pulsando**, faixa `bg-accent/5`. Pausada: ponto em `paused`, **sem pulso**, faixa
  `bg-paused/5`. É a mesma língua do chip da barra de título e do omnibox rodando. O ponto carrega
  `title` ("Em execução" / "Pausada"), que é a única coisa que anuncia o estado sem ser cor.
- **A seleção vence o fundo.** Marcada, a linha volta ao `bg-accent/10` da seleção — é o gesto que o
  usuário está fazendo agora —, e o ponto continua lá. Fosse o contrário, a linha em execução
  sumiria no meio das outras justamente enquanto se escolhe o que excluir.
- **O sinal é o que já existia**: `playBlock === "self"`, a mesma leitura que decide se o ▶ desta
  linha está bloqueado por ela mesma. `executionOf` (em `components/playAction.ts`, ao lado do
  `resolvePlayBlock`) traduz esse `self` mais o status da tarefa em curso no realce; quem deriva é a
  tela (`WeekPlanningView`), porque o `PlannedTaskItem` só conhece o id da planejada. O realce em si
  é do `TaskRow`, então toda lista que passar a prop o ganha idêntico.

#### Lógica de Concluir/Pendente

- **Concluir:** Adiciona a data atual ao array `completed_dates`. Tarefa deixa de aparecer na lista de planejadas na Tela de Tarefas para aquele dia, mas permanece no planejamento.
- **Pendente:** Remove a data do array `completed_dates`. Tarefa volta a aparecer como planejada.

---
