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
- **Só dias úteis.** Sábado e domingo não aparecem no planejamento, e não há configuração que os traga de volta — a antiga `showWeekend` foi removida. `recurringDays` continua na escala do `Date` (0=Dom…6=Sáb): a lista de dias da recorrência oferece 1 a 5, mas **não** reindexe os valores, ou toda tarefa recorrente já gravada muda de dia.

> **A regra vale também na entrada, e o import da Agenda era o único lugar que ainda não a
> cumpria.** Ele listava a semana inteira e oferecia os sete dias na recorrência, então o evento de
> sábado nascia planejada sem dia onde aparecer. O descarte é **na origem** — a lista de eventos
> logo depois da busca —, não só na renderização dos dias: escondido mas presente na lista, o evento
> continuava selecionado por padrão, entrava na contagem do botão e era importado do mesmo jeito. Os
> dias sugeridos pela recorrência do Google são aparados pela mesma régua, ou a série que repete às
> segundas e aos sábados guardaria um `6` que a lista de dias não mostra nem permite desmarcar.
- **Botões rápidos de dia:** Todos | Seg | Ter | Qua | Qui | Sex, no topo da coluna da direita. Ao clicar em um dia, filtra a lista e preenche o campo Data do formulário automaticamente.
- **Barra de seleção:** "Selecionar tarefas" fica na **mesma linha dos botões de dia**, encostado à direita (`ml-auto`) — não no header, e só aparece havendo ao menos uma tarefa. Cabe ali desde que o fim de semana saiu do planejamento; uma linha só para a barra custava altura que é da lista. A rolagem horizontal fica no grupo das pílulas, não na linha: na linha, os botões de seleção sairiam da tela junto com os dias.
- **Formulário inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, campos personalizados, agendamento e ações — empilhados na coluna.
- **Campo Data única já nasce preenchido, e não tem atalho "Hoje".** O botão dizia duas coisas ao mesmo tempo — "a data é hoje" e "leve a data para hoje" —, e aceso lia como filtro. No lugar dele, o campo abre com o dia navegado (ou com hoje, sem um) nesta coluna, e com hoje nos dois formulários de edição quando a tarefa não tem data gravada (`usePlannedTaskEditor`). **Data já gravada não é sobrescrita**: alternar para "Recorrente" e voltar devolve o dia escolhido.
- **Tipos de agendamento:**
  - `specific_date`: Dia único. Campo data preenchido de saída.
  - `recurring`: Seleção de dias da semana. Sem data de término. Aparece até ser excluída.
  - `period`: Data início + Data fim. Aparece durante todo o período.
- **Ações por tarefa:** Array de `{ type: "open_url" | "open_file", value: string, label?: string }`. URL auto-completa `https://` se ausente. N ações por tarefa. As ações não são disparadas automaticamente ao iniciar — ficam acessíveis como chips no Popup Flyout durante a execução (ver §6.5).
- **O sub-formulário de ação tem uma grafia só**, o `PlannedActionsField`, e é ele que serve as três telas que editam ações: esta coluna, o `EditPlannedTaskModal` e o `PlannedTaskEditSheet` do popup. Estava escrito três vezes e as três já discordavam (`text-purple-400` cru no glifo de arquivo em duas, três controles de remover, três de adicionar), mas o que cobrava caro era outra coisa: acrescentar um campo custava três edições em **dois** donos de estado, porque o `PlannedTaskForm` guardava o seu próprio par `newActionType`/`newActionValue` em vez do `usePlannedTaskEditor` — que hoje expõe só `actions`/`setActions`. O `compact` empilha o tipo acima do valor para as duas colunas estreitas (280 px aqui, 264 no painel), no mesmo eixo do `CustomFieldInputs`; **o rótulo da seção fica no call site**, porque os três dizem coisas diferentes e aqui ele carrega junto o divisor que quebra a coluna em blocos. A ordem dos campos é a da leitura — que tipo é, como se chama, para onde aponta —, com o acrescentar encostado no último, que é onde o Enter cai depois de digitar o valor.
- **Tecla Enter:** Se autocomplete fechado → cria a tarefa. Se autocomplete aberto → seleciona item.
- **Edição:** abre modal completo.
- **Botões por tarefa:** Play | Concluir/Pendente | Duplicar | Ações (expandir/editar ações) | Excluir (sem confirmação). **Só aparecem no hover da linha, e sem hover não ocupam largura** (`w-0` + `overflow-hidden`, não apenas `opacity-0`): reservados, o espaço de cinco botões saía do nome da tarefa, que truncava numa linha vazia à direita. `focus-within` abre o bloco para quem navega pelo teclado.
- **E o chip de faturamento vem depois deles, ancorado à direita.** A largura que os botões abrem sai do `1fr` do nome e puxa para a esquerda tudo o que estiver à direita dele: com o chip antes, ele andava ~118px no instante em que o cursor entrava na linha, e o `Excluir` — que não pergunta — herdava o lugar onde o dedo já estava indo. Desde que o chip virou controle (`bbb4a1b`), posição estável é requisito, não acabamento. Em repouso o desenho não muda: a célula fechada cancela o `gap` que não ocupa (`-mr-2.5`), e o chip fica exatamente onde sempre esteve. Só vale onde a célula fecha em largura — nas Entradas, que têm duração e portanto célula já reservada, o chip continua antes.
- **Importar Google Agenda:** **não se entra por aqui.** O botão que ficava ao lado da navegação de semana foi removido — o modal abre pelo rail de integrações e pela tela de Integrações, que é onde está o seletor de workspace que governa o destino do import (§5.7). Ter dois caminhos para o mesmo modal era justamente o que fazia o import nascer num workspace diferente do que o Planejamento mostra na tela.

#### Lógica de Concluir/Pendente
- **Concluir:** Adiciona a data atual ao array `completed_dates`. Tarefa deixa de aparecer na lista de planejadas na Tela de Tarefas para aquele dia, mas permanece no planejamento.
- **Pendente:** Remove a data do array `completed_dates`. Tarefa volta a aparecer como planejada.

---
