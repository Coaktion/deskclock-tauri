# 5.2 Tela de Tarefas (página principal)

> Extraído da §5.2 do CLAUDE.md em 2026-08-10, verbatim. **A seção 2 foi reescrita em
> 2026-08-19**, quando as planejadas do dia deixaram o bloco próprio e voltaram a ser a lista
> suspensa do omnibox.

### 5.2 Tela de Tarefas (página principal)

**Layout de cima para baixo:**

#### Seção 1 — Tarefa atual em execução

- Exibe todos os dados preenchidos + timer ativo.
- Campo de hora de início editável — ao alterar, recalcula o timer.
- **Botões:** Play/Pause | Stop | Edit | Cancel
- **Edit:** Abre campos inline: Nome, Projeto (autocomplete), Categoria (autocomplete), Billable toggle. Botões: Salvar / Cancelar.
- **Cancel:** Descarta a tarefa imediatamente, sem confirmação.
- **Atalhos globais:** Se configurados, exibir abaixo como texto informativo (ex: "Ctrl+Shift+S para parar").

#### A tarefa em execução na barra de título (fora da tela de Tarefas)

Decisão do usuário, 2026-09-15: a tarefa ativa fica visível em **todas** as telas da janela
principal. O `TitleBar` ganha um bloco **centralizado** (`TitleBarRunningTask`) com ponto de status
(`ExecutionDot` — pulsa em acento enquanto roda, fica parado em `paused` na pausa; o pulso chegou
aqui em 2026-09-15, com a extração do primitivo, por decisão do usuário), nome ("(sem nome)" quando
vazio), cronômetro `HH:MM:SS` — acento rodando, `paused` pausada — e as ações ⚡ (quando a
planejada de origem tem ações), Pausar/Retomar, Parar e Cancelar. Tudo dentro de um chip de 24px
tingido pelo mesmo estado — o tingimento de borda e fundo do omnibox em execução —, para ser
achado de relance.

- **Some na tela de Tarefas**: ali o omnibox já mostra o mesmo, e repetir o cronômetro a 100px de
  distância só duplicaria.
- **Clicar no rótulo — ponto, nome e cronômetro — leva a Tarefas** com o omnibox em foco, pelo mesmo
  pedido `omniboxFocus: "edit"` do overlay, que abre o chip de projeto ou categoria quando falta um.
  Quem recebe o clique é o rótulo, e não a casca: `role="button"` no chip tornaria presentacionais os
  três botões de dentro, e o leitor de tela anunciaria tudo como um controle só.
- **Parar sempre navega para Tarefas** e abre lá o fluxo de parada do omnibox ("Concluída?" ou o
  preenchimento obrigatório). A barra tem 32px e não cabe esse fluxo; reimplementá-lo seria uma
  segunda lógica de parada para divergir da primeira. O pedido viaja como `omniboxFocus: "stop"`, o
  mesmo canal do `"edit"` que o overlay usa.
- **Cancelar descarta na hora**, sem confirmação (regra do produto), e fica separado do Parar por um
  traço — o mesmo motivo do omnibox: o descarte não pode ficar a um pixel da ação que salva.
- **O ⚡ da planejada de origem é o quinto controle**, entre o rótulo e o Pausar — age sobre a
  tarefa, então fica do lado das ações que salvam, e não além do traço. É o mesmo
  `PlannedActionsFlyout` das linhas, na variante `icon`: uma ação executa direto, duas ou mais abrem
  o painel de chips, para baixo e alinhado à direita do ⚡. **A contagem não aparece**: são 24px de
  altura com quatro botões, e a pílula com número não cabe; ela vai para o nome acessível ("Abrir
  uma das N ações"). Sem planejada de origem, ou sem ações, o ⚡ não é desenhado. As ações vêm de
  `usePlannedTaskActions`, que relê ao evento de planejadas alteradas.
- As laterais continuam região de arraste; o bloco do meio não é, para os cliques funcionarem.

#### Seção 2 — Tarefas planejadas para hoje (dentro do omnibox)

- **Não há bloco próprio na tela.** As planejadas pendentes do dia são a lista suspensa do omnibox:
  ela abre ao focar o campo e o texto digitado a filtra (`matchPlannedTasks`, busca fuzzy pelo nome).
- A lista é **flutuante** — pendurada no card, fora do fluxo. Em fluxo, abri-la a cada foco
  empurraria KPIs e Entradas tela abaixo, que é metade da queixa que a tirou daqui em `86e3245`.
- Ela **sobrepõe** de fato: recuada 8px de cada lado do card e 8px abaixo dele, com a sombra
  `--shadow-overlay`. Sem isso, painel e faixa de KPI ficavam a 0,025 de lightness um do outro no
  modo escuro, e a lista lia como mais uma seção da página. Ver a skill `design-system`.
- Mostra **quatro tarefas inteiras** (236px de teto) e deixa a quinta assomar cortada, que é o que
  indica que a lista rola.
- Cada linha é um `TaskRow`: círculo de concluir, ponto na cor do projeto, nome,
  `projeto · categoria` e o chip de faturamento, que **continua alternando** (o `BillableChip`
  barra a propagação, então alterná-lo não dispara a linha).
- **O círculo de concluir é a única ação da linha** (2026-09-19, spec
  `docs-internal/specs/acoes-da-linha-planejada.md`, G6): `ui/CompleteToggle` no slot `leading`,
  que também barra a propagação — concluir não inicia a tarefa. **Não há ⋯ nem clique direito
  aqui**: a lista existe para escolher o que iniciar, e Editar, Duplicar, Copiar link e Excluir
  moram na linha do Planejamento e na do popup. Como a lista mostra só as **pendentes**, concluir
  tira a tarefa dela; reabrir é pelo Planejamento ou pelo popup.
- **Clicar na linha inicia a tarefa na hora**, com o vínculo (`plannedTaskId`) e os campos
  personalizados da planejada. Pelo teclado: ↑/↓ andam pela lista e Enter inicia a ativa; com a
  lista fechada ou vazia, Enter inicia o rascunho como tarefa avulsa. ESC fecha só a lista.
- Rodapé da lista: **"Ver semana →"**, que leva ao Planejamento.
- **A lista suspensa do omnibox não oferece as ações** — o ⚡ que as executa está na linha do Planejamento e na lista de planejadas do popup, e ali ele dispensa dar play e abrir a edição. Durante a execução elas continuam como chips clicáveis no Popup Flyout (ver §6.5).

> **Nota:** O lançamento retroativo foi movido para uma tela dedicada na sidebar (ver 5.8). A ideia de "botão que abre modal" foi descartada — a tela dedicada permite entrada em sequência de múltiplas tarefas com muito mais agilidade.

#### Seção 3 — Totalizadores

- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").
- Os quatro cartões ocupam a **linha inteira**, como o design desenha. O arranjo em 2×2 existia
  para dividir a linha com o bloco de planejadas e saiu com ele.

#### Seção 4 — Entradas de hoje

- **Header:** Título "Entradas de Hoje" + total de horas hoje.
- **Lista de tarefas registradas hoje:**
  - Card exibe: Nome, Projeto, Categoria, indicador billable (clicável para alternar), duração.
  - **Ações da linha** (2026-09-19, spec `docs-internal/specs/acoes-da-linha-planejada.md`, G4):
    o ▶ "Iniciar com estes dados" é a única ação visível, na coluna fixa à direita (bloqueado
    quando há tarefa em andamento, visível e desabilitado com o motivo no `title`); **Editar** e
    **Excluir** ficam no ⋯ e no clique direito; o clique na linha edita. Com a linha focada,
    `Enter` inicia, `E` edita, `Del` exclui e as setas andam entre as linhas. Excluir continua sem
    confirmação, mas agora **se desfaz** pelo toast ou pelo `Ctrl+Z` (`useTaskUndo`).
- **A linha da tarefa em execução se realça** (2026-09-15): ponto de 6px ao lado do nome — acento
  pulsando enquanto roda, `paused` parado quando pausada — e a faixa tingida no mesmo tom
  (`ExecutionDot` + a prop `execution` do `TaskRow`). A execução em curso é **outro registro**, sem
  id que a ligue à linha: quem as identifica é a chave de agrupamento (§6.3), a mesma que o ▶ desta
  tela já usa para decidir o que repetir. A leitura é uma só por linha — a que bloqueia o ▶ é a que
  acende a linha —, e mora no `TodayEntriesSection`, que é onde a tarefa em execução está.
- **Só o cabeçalho do grupo e a entrada solta se acendem; as filhas, nunca.** A chave é de todas as
  irmãs por definição, então acender por chave acenderia o grupo inteiro — seis registros
  realçados por causa de uma execução que não é nenhum deles. Quem fala pela chave é o cabeçalho, e
  é ele que se acende; expandir o grupo não espalha o realce. É por isso que `execution` é prop
  própria do `TaskCard` e não uma leitura do `playBlock`: o bloqueio do ▶ vale para o grupo inteiro,
  o realce não.
- **Agrupamento:** Tarefas com mesmo Nome + Projeto + Categoria são agrupadas visualmente.
  - Grupo exibe duração total.
  - O cabeçalho do grupo **não tem ação visível**: "Editar grupo", "Mover para workspace" e
    "Unificar" ficam no ⋯ e no clique direito (`E` edita o grupo com a linha focada). O clique na
    linha continua expandindo.
  - "Unificar" mescla em registro único somando durações, sem confirmação (início e fim: §6.3).
  - Editar grupo → altera todas as tarefas do grupo.
  - Expandir grupo → editar/excluir tarefa individual, cada uma com o ▶ e o ⋯ próprios.

---

> **A Seção 5 saiu daqui em 2026-08-28.** O resumo por IA deixou a tela de Tarefas e passou ao
> Histórico, onde resume os dias do resultado da busca — ver `docs-internal/telas/historico.md`.
> Não procure por `DailySummarySection` nem pelas chaves `llmSummary*` de `AppConfig`: as duas
> coisas foram apagadas.
