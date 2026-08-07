# CLAUDE.md — Especificação do Projeto DeskClock

> **Propósito deste documento:** Servir como fonte única de verdade para agentes de IA durante todo o ciclo de desenvolvimento. Toda decisão de implementação, arquitetura e design deve ser validada contra este documento. Atualize-o sempre que padrões ou decisões mudarem.

---

## 1. VISÃO GERAL DO PROJETO

**Nome:** DeskClock  
**Tipo:** Aplicativo desktop multiplataforma  
**Objetivo:** Registro de horas trabalhadas com flexibilidade total — o app se adapta ao modo de trabalho do usuário, não o contrário.

**Princípios de design:**
- Cadastros devem exigir o mínimo de cliques possível.
- Edições sempre em modais.
- Exclusões sem confirmação — a ação é imediata.
- Overlays arrastáveis com persistência de posição.
- Atalhos globais para operações frequentes.
- Lançamento retroativo como tela dedicada — fluxo de entrada rápida em sequência, sem modal.

---

## 2. STACK TECNOLÓGICA

| Camada | Tecnologia |
|---|---|
| Framework desktop | Tauri |
| Frontend | React + TypeScript |
| Estilização | Tailwind CSS |
| Ícones | Lucide React |
| Banco de dados | SQLite (via Tauri) |
| Arquitetura | Clean Architecture |
| Linting | ESLint + Prettier |
| Testes | Vitest (unit) |
| Build targets | Windows, Ubuntu, Arch Linux |

---

## 3. ARQUITETURA

```
src/
├── domain/           # Entidades, interfaces de repositório, casos de uso
│   ├── entities/     # Task, PlannedTask, Project, Category, ExportProfile, Workspace
│   ├── repositories/ # Interfaces (ports)
│   └── usecases/     # Lógica de negócio pura
├── infra/            # Implementações concretas
│   ├── database/     # SQLite repositories
│   ├── integrations/ # Google Sheets, Google Calendar
│   └── system/       # Atalhos globais, tray, overlay window management
├── presentation/     # React UI
│   ├── pages/        # Tasks, Planning, History, Retroactive, Data, Settings
│   ├── components/   # Componentes reutilizáveis (Autocomplete, DatePickerInput…)
│   ├── overlays/     # CompactOverlay, PopupFlyout, CommandPaletteApp, Toast
│   ├── modals/       # Modais de edição (EditTaskModal, ExportModal…)
│   └── hooks/        # Custom hooks
├── shared/           # Types, utils, constants
└── tests/            # Espelha a estrutura de src/
```

**Regras de dependência (Clean Architecture):**
- `domain/` não importa nada de `infra/` ou `presentation/`.
- `infra/` implementa interfaces definidas em `domain/`.
- `presentation/` consome `domain/` via hooks/contextos, nunca acessa `infra/` diretamente.
- Novas integrações e bancos de dados devem ser adicionados em `infra/` sem alterar `domain/`.

---

## 4. MODELO DE DADOS

### 4.1 Task (Registro de hora)

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK, gerado automaticamente |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string \| null | Exibir "(sem nome)" se vazio |
| project_id | UUID \| null | FK → Project |
| category_id | UUID \| null | FK → Category |
| billable | boolean | Padrão herdado da Category selecionada |
| start_time | datetime | Obrigatório |
| end_time | datetime \| null | null = em execução |
| duration_seconds | integer \| null | Calculado: end_time - start_time |
| status | enum | `running` \| `paused` \| `completed` |
| planned_task_id | UUID \| null | Referência lógica à PlannedTask de origem (**sem FK**); `null` = tarefa solta |
| created_at | datetime | Auto |
| updated_at | datetime | Auto |

> **A origem é persistida, e é imutável depois do início.** O vínculo com a
> planejada vivia só em memória (`activePlannedTaskId` no `RunningTaskContext`, um
> `useRef` no `PopupOverlayApp`), e reabrir o app o perdia: **parar a tarefa não
> marcava mais a planejada como concluída** no dia — ela reaparecia pendente —, os
> chips de "Ações" sumiam do popup e o rastreamento de reuniões perdia o sinal
> forte de reconhecimento (§5.7). As duas janelas restauram o vínculo no mount,
> lendo-o da tarefa. O `UPDATE` do repositório **não** toca a coluna: quem monta
> uma `Task` para editar, mesclar ou aplicar regras pós-parada não conhece a
> origem, e incluí-la no update apagaria o vínculo sem querer. Reinferir por
> nome/projeto/categoria foi descartado — é matching aproximado escolhendo qual
> planejada concluir, sem desfazer.
>
> Duas consequências decididas de propósito: **mesclar** um grupo produz registro
> **sem** origem (a origem não compõe a chave do grupo, então as mescladas podem vir
> de planejadas diferentes, e herdar a da primeira afirmaria o que o somado não
> tem), e **mover para outro workspace** leva a origem junto — fica um id de
> planejada do workspace anterior, inerte, porque só tarefa em execução tem o
> vínculo lido e o que se move já está concluído.
>
> **Reexecutar leva a origem junto.** O ▶ de uma entrada de hoje e a sugestão
> "recente" do acesso rápido copiam nome, projeto, categoria e campos
> personalizados — e agora também de qual planejada aquilo veio. Sem isso a
> segunda execução parava sem ter qual planejada concluir, e ela reaparecia
> pendente no planejamento justamente no dia em que foi mais trabalhada. É o
> oposto do caso da mescla: aqui a cópia tem uma origem só, e é a da tarefa
> copiada. A sugestão continua marcada como **não** planejada — ela veio do
> histórico do dia, não da lista de planejadas.
>
> **Quem para a tarefa pergunta a ela, se ninguém disse.** `usePostStopLogic`
> recebe o id da planejada de fora, passado de mão em mão entre janelas e eventos;
> vindo vazio, ele cai no `plannedTaskId` da própria tarefa. O caminho de fora
> ainda ganha — ele conhece o start desta execução —, mas um caminho novo que
> esqueça de repassá-lo deixa de falhar em silêncio.
>
> **No evento entre janelas, campo ausente e `null` querem dizer coisas
> diferentes.** O `plannedTaskId` do `RUNNING_TASK_CHANGED` é opcional, e omiti-lo
> significa "não altere a origem": é o que pausar, retomar e atualizar fazem, por
> não mexerem nela. `null` é o oposto — afirma que a tarefa nasceu solta. A janela
> principal colapsava os dois em `null`, então **pausar pelo popup apagava o
> vínculo no meio da execução**, e com ele o reconhecimento de reunião por
> planejada (§5.7, que cai no nome exato) e os chips de "Ações" do Omnibox. A regra
> vive em `resolveActivePlannedLink` (`domain/utils/plannedLink.ts`), fora do
> contexto React, porque foi implementada em duas janelas e divergiu em silêncio
> numa delas. Ela é aplicada pela forma funcional do `setState`: o listener é
> registrado uma vez só, e ler o vínculo pelo closure devolveria o valor do mount.
> **O popup segue decidindo em linha**, e não por descuido: lá o mesmo ramo também
> levanta a marca de estado ao vivo e carrega as ações da planejada.
>
> **O vínculo é de mão dupla: configurar a tarefa depois de iniciada configura a
> planejada.** Editar nome, projeto, categoria, billable ou campos personalizados
> durante a execução gravava **só** na tarefa, então a planejada que nasceu crua —
> reunião da Agenda, item do Monday sem categoria — voltava crua na ocorrência
> seguinte, e o trabalho de preencher se repetia todo dia. Agora
> `applyRunningTaskEditToPlanned` leva a mesma edição de volta, e vale para os três
> tipos de agendamento: numa recorrente ela muda todos os dias futuros, que é o
> ponto — a planejada é um molde único, sem instância por dia. É automática, sem
> botão, e o risco foi aceito na decisão: corrigir o projeto de *uma* execução muda
> o plano em silêncio e sem desfazer.
>
> A presença do campo é testada por `in`, nunca por valor — `null` em projeto ou
> categoria é escolha do usuário e precisa **limpar** o da planejada, enquanto
> campo ausente significa "não mexi nisso". **Nome vazio é a exceção e não
> propaga**: `PlannedTask.name` é obrigatório (§4.2) e a linha do planejamento não
> tem outro identificador, então apagar o nome de uma tarefa em andamento deixaria
> a planejada sem nada a exibir — numa recorrente, para sempre. `startTime` fica de
> fora porque na tarefa é o instante do início e na planejada é o "HH:MM" do import
> da Agenda: corrigir o relógio de uma execução nada diz sobre o horário planejado.
>
> **Planejada apagada não é erro.** A poda do Monday e a exclusão à mão apagam
> planejadas com a tarefa ainda rodando, e aí o vínculo aponta para o vazio; o use
> case devolve `null` sem escrever, porque lançar faria uma edição já gravada com
> sucesso na tarefa aparecer como erro na tela. O caminho existe nas duas janelas —
> `updateActiveTask` (que cobre a janela principal e o Omnibox) e o `handleUpdate`
> do popup —, cada uma com o mesmo fallback no `plannedTaskId` da própria tarefa.

### 4.2 PlannedTask (Tarefa planejada)

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Obrigatório |
| project_id | UUID \| null | FK → Project |
| category_id | UUID \| null | FK → Category |
| billable | boolean | Herdado da Category |
| schedule_type | enum | `specific_date` \| `recurring` \| `period` |
| schedule_date | date \| null | Para `specific_date` |
| recurring_days | integer[] \| null | Para `recurring` (0=Dom, 1=Seg...6=Sáb) |
| period_start | date \| null | Para `period` |
| period_end | date \| null | Para `period` |
| completed_dates | date[] | Datas em que foi marcada como concluída |
| actions | JSON | Array de `{ type: "open_url" \| "open_file", value: string }` |
| sort_order | integer | Para ordenação manual |
| created_at | datetime | Auto |

### 4.3 Project

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Único **por workspace** (`UNIQUE(workspace_id, name)`) |

### 4.4 Category

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Único **por workspace** (`UNIQUE(workspace_id, name)`) |
| default_billable | boolean | Padrão para novas tarefas com esta categoria |

### 4.5 ExportProfile

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| workspace_id | UUID | FK → Workspace, obrigatório |
| name | string | Obrigatório |
| is_default | boolean | Apenas um pode ser default **por workspace** (índice parcial) |
| format | enum | `csv` \| `json` |
| separator | enum | `comma` \| `semicolon` (apenas CSV) |
| duration_format | enum | `hh:mm:ss` \| `decimal` \| `minutes` |
| date_format | enum | `iso` \| `dd/mm/yyyy` |
| columns | JSON | Array de `{ field, label, visible, order }` |

### 4.6 Workspace

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK. O workspace "Padrão" tem id sentinela fixo, semeado pela migration 011 |
| name | string | Único, obrigatório |
| color | string | **Nome de um slot** da paleta (`teal`, `amber`…), nunca um valor de cor |
| created_at | datetime | Auto |

Escopam por workspace: `Task`, `PlannedTask`, `Project`, `Category` e
`ExportProfile`. **Custom fields, quando existirem, serão globais** — ver
`docs/specs/workspaces-custom-fields.md`.

### 4.7 Config (chave-valor)

| Campo | Tipo |
|---|---|
| key | string (PK) |
| value | JSON |

---

## 5. TELAS E FUNCIONALIDADES

### 5.1 Overlays (Janelas flutuantes)

> **Arquitetura atual:** 2 janelas independentes — Compact Overlay (sempre visível) + Popup Flyout (aparece ao clicar). O Welcome Overlay foi substituído pelo Command Palette. O Execution Overlay foi unificado no Popup Flyout.

#### 5.1.1 Compact Overlay
- **Sempre visível** (always-on-top), arrastável, com persistência de posição.
- **Estado idle** (sem tarefa em execução): ícone do app + badge com contador de tarefas planejadas pendentes.
- **Estado running**: timer `MM:SS` pulsante substituindo o ícone; anel com glow animado no estilo da cor de status.
- **Estado paused**: indicador visual de pausa.
- **Clique:** abre o Popup Flyout.
- **Grip bar** para arraste, com snap-to-grid opcional.
- **Workspace:** com mais de um workspace, a cor do ativo aparece como duas faixas nas bordas do botão, com o miolo aberto pelo fundo do ícone. Some quando só existe um.

#### 5.1.2 Popup Flyout (Overlay de execução)
- **Aparece ao clicar** no Compact Overlay — flyout acoplado, não janela separada.
- **Estado idle:** lista de tarefas planejadas para hoje + botão "Nova tarefa". Cada linha tem botões `Editar` (✎), `Concluir` (✓) e `Iniciar` (▶) — concluir marca a tarefa como concluída no dia atual sem precisar abrir o planejamento, útil para corrigir tarefas que pararam com "Pendente" mas estavam de fato finalizadas. Botões do header: `Ir para planejamento` | `Fechar`.
- **Editar planejada sem sair do overlay (`PlannedTaskEditSheet`):** painel que cobre o conteúdo do popup **no tamanho que ele já tem** — a janela não cresce, porque crescer tiraria o overlay do canto onde o usuário o deixou. Traz os mesmos campos do `EditPlannedTaskModal`, **nesta ordem**: nome, projeto, categoria com billable, campos personalizados, agendamento e ações. Os campos personalizados vêm antes do agendamento porque são atributos do trabalho, como projeto e categoria; o agendamento é o bloco que diz *quando*, e intercalá-los partia os dois grupos ao meio. O que garante que os dois não divirjam é o `usePlannedTaskEditor`, que guarda todo o estado e a montagem do payload; os componentes só dispõem os campos na tela (§9.4). Adaptações para os 264 px úteis: tudo empilhado em coluna, dias da recorrência com uma letra (o dia inteiro fica no `title`), período com as duas datas empilhadas, e o corpo rolando por dentro — é a rolagem que absorve campos personalizados e ações sem mexer na janela. Com o painel aberto, o popup **não fecha no blur nem no ESC** (o ESC fecha o painel) — fechar sozinho descartaria a edição, a mesma guarda já usada pelo prompt de reunião.
- **Estado running/paused:** nome da tarefa, timer ao vivo, borda lateral colorida (billable/non-billable). Controles: Play/Pause, Stop (com confirmação Concluída/Pendente), Cancelar, Fechar.
- **Confirmação de Stop:** ao clicar em Parar, abre um painel inline com input `HH:MM` da hora de término (preenchido com a hora atual) e botões `Concluída` / `Pendente`. Se o usuário não tocar no campo, o término é gravado como agora. Se backdatear, a hora informada vira o `endTime` e a `durationSeconds` é recalculada — atendendo ao caso "esqueci de parar o timer". Validação inline rejeita horas anteriores ao `startTime`.
- **Edição inline por campo:** clique em nome, projeto ou categoria abre edição in-place sem modal. Vindo a tarefa de uma planejada, a edição **também configura a planejada de origem** (§4.1) — é aqui que a reunião importada da Agenda ganha projeto e categoria de uma vez por todas.
- **Hora de início** editável — recalcula o timer ao alterar.
- **Seção "Ações"** (quando a tarefa em execução tiver ações configuradas): chips clicáveis que disparam cada ação sob demanda — não há mais execução automática ao iniciar.
- **Workspace:** chip no header com o workspace ativo e troca pelo próprio overlay, com a mesma guarda de "parar e trocar". Some com um único workspace.

---

### 5.2 Tela de Tarefas (página principal)

**Layout de cima para baixo:**

#### Seção 1 — Tarefa atual em execução
- Exibe todos os dados preenchidos + timer ativo.
- Campo de hora de início editável — ao alterar, recalcula o timer.
- **Botões:** Play/Pause | Stop | Edit | Cancel
- **Edit:** Abre campos inline: Nome, Projeto (autocomplete), Categoria (autocomplete), Billable toggle. Botões: Salvar / Cancelar.
- **Cancel:** Descarta a tarefa imediatamente, sem confirmação.
- **Atalhos globais:** Se configurados, exibir abaixo como texto informativo (ex: "Ctrl+Shift+S para parar").

#### Seção 2 — Tarefas planejadas para hoje
- Lista compacta: Nome + botão Play.
- Play inicia execução com dados da tarefa planejada preenchidos. As ações configuradas ficam disponíveis como chips clicáveis no Popup Flyout durante a execução (ver §6.5).

> **Nota:** O lançamento retroativo foi movido para uma tela dedicada na sidebar (ver 5.8). A ideia de "botão que abre modal" foi descartada — a tela dedicada permite entrada em sequência de múltiplas tarefas com muito mais agilidade.

#### Seção 3 — Totalizadores
- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").

#### Seção 4 — Entradas de hoje
- **Header:** Título "Entradas de Hoje" + total de horas hoje.
- **Lista de tarefas registradas hoje:**
  - Card exibe: Nome, Projeto, Categoria, indicador billable (clicável para alternar), duração.
  - **Botões por card:** Play (inicia nova execução com os mesmos dados, se não houver tarefa em andamento) | Edit (modal completo) | Delete (sem confirmação).
- **Agrupamento:** Tarefas com mesmo Nome + Projeto + Categoria são agrupadas visualmente.
  - Grupo exibe duração total.
  - Botão "Unificar" no grupo → mescla em registro único somando durações, sem confirmação.
  - Edit no grupo → altera todas as tarefas do grupo.
  - Expandir grupo → editar/excluir tarefa individual.

---

### 5.3 Tela de Planejamento

> **Decisão de produto:** A visão "Hoje" foi removida. A visão Semana já permite selecionar qualquer data (incluindo hoje) e é suficiente para todos os fluxos de planejamento.

- **Header:** Intervalo da semana (ex: "06/04 — 12/04/2026") + navegação ← → + pílula "Semana atual" + contador de concluídas.
- **A pílula "Semana atual" é botão e indicador ao mesmo tempo**, no lugar que era do botão de importar da Agenda. Navegadas algumas semanas, o intervalo em dd/mm não responde sozinho "esta é a de hoje?" — a pílula **acesa** é a resposta, e **apagada** é o caminho de volta em um clique. Fica sempre visível, e não desabilita na semana atual: é a mesma pílula "Hoje" do formulário (§5.3, campo Data única), que já resolve o equivalente para o campo de data. Volta também o filtro de dia para "Todos", como as setas.
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
- **Botões rápidos de dia:** Todos | Seg | Ter | Qua | Qui | Sex, no topo da coluna da direita. Ao clicar em um dia, filtra a lista e preenche o campo Data do formulário automaticamente.
- **Barra de seleção:** "Selecionar tarefas" fica na **mesma linha dos botões de dia**, encostado à direita (`ml-auto`) — não no header, e só aparece havendo ao menos uma tarefa. Cabe ali desde que o fim de semana saiu do planejamento; uma linha só para a barra custava altura que é da lista. A rolagem horizontal fica no grupo das pílulas, não na linha: na linha, os botões de seleção sairiam da tela junto com os dias.
- **Formulário inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, campos personalizados, agendamento e ações — empilhados na coluna.
- **Atalho "Hoje":** No campo Data única, botão de atalho seleciona a data atual.
- **Tipos de agendamento:**
  - `specific_date`: Dia único. Campo data com botão atalho "Hoje".
  - `recurring`: Seleção de dias da semana. Sem data de término. Aparece até ser excluída.
  - `period`: Data início + Data fim. Aparece durante todo o período.
- **Ações por tarefa:** Array de `{ type: "open_url" | "open_file", value: string }`. URL auto-completa `https://` se ausente. N ações por tarefa. As ações não são disparadas automaticamente ao iniciar — ficam acessíveis como chips no Popup Flyout durante a execução (ver §6.5).
- **Tecla Enter:** Se autocomplete fechado → cria a tarefa. Se autocomplete aberto → seleciona item.
- **Edição:** abre modal completo.
- **Botões por tarefa:** Play | Concluir/Pendente | Duplicar | Ações (expandir/editar ações) | Excluir (sem confirmação). **Só aparecem no hover da linha, e sem hover não ocupam largura** (`w-0` + `overflow-hidden`, não apenas `opacity-0`): reservados, o espaço de cinco botões saía do nome da tarefa, que truncava numa linha vazia à direita. `focus-within` abre o bloco para quem navega pelo teclado.
- **Importar Google Agenda:** **não se entra por aqui.** O botão que ficava ao lado da navegação de semana foi removido — o modal abre pelo rail de integrações e pela tela de Integrações, que é onde está o seletor de workspace que governa o destino do import (§5.7). Ter dois caminhos para o mesmo modal era justamente o que fazia o import nascer num workspace diferente do que o Planejamento mostra na tela.

#### Lógica de Concluir/Pendente
- **Concluir:** Adiciona a data atual ao array `completed_dates`. Tarefa deixa de aparecer na lista de planejadas na Tela de Tarefas para aquele dia, mas permanece no planejamento.
- **Pendente:** Remove a data do array `completed_dates`. Tarefa volta a aparecer como planejada.

---

### 5.4 Tela de Histórico

#### Filtros
- **Rápidos:** Hoje | 7 dias | 30 dias | Este mês.
- **Avançados:** Período início/fim, Nome, Projeto, Categoria, Billable.
- **Botões:** Buscar | Exportar resultados.

#### Resultados
- **Totalizadores:** Total horas | Total billable | Total non-billable | Qtd registros.
- **Agrupamento por dia:** Header do grupo = "Ter. 7 de abr de 2026 — 8:00" (dia da semana abreviado + data + total de horas do dia).
- **Por grupo-dia:** Botão exportar individual.
- **Por tarefa:** Botões Edit (modal) | Delete (sem confirmação).

---

### 5.5 Exportação de Tarefas

#### Perfis de exportação
- CRUD completo com um perfil padrão pré-existente (editável).
- Interface simples: lista de perfis + criar novo / editar / excluir.

#### Configuração do perfil
- **Período:** Hoje | Personalizado (início + fim).
- **Formato:** CSV | JSON.
- **Separador (CSV):** Vírgula | Ponto-e-vírgula.
- **Formato de duração:** HH:MM:SS | Decimal | Minutos.
- **Formato de data:** ISO (AAAA-MM-DD) | DD/MM/AAAA.
- **Colunas:** Reordenáveis via drag-and-drop. Toggle de visibilidade por coluna. Nome editável por coluna.

#### Seleção de tarefas
- Todas selecionadas por padrão. Selecionar todas / Desmarcar todas / Individual.
- Tarefas agrupadas geram registro único com duração totalizada.

#### Destino
- Salvar arquivo | Copiar para área de transferência | Enviar para integração externa.

---

### 5.6 Tela de Dados

#### Projetos
- **Importação em massa:** Textarea, um projeto por linha.
- **Lista:** Filtro por nome + adicionar individualmente + excluir sem confirmação.

#### Categorias
- **Importação em massa:** Textarea, uma categoria por linha. Prefixo `!` = non-billable (ex: `!Reuniões`). Sem prefixo = billable.
- **Lista:** Filtro por nome + adicionar individualmente (com toggle billable) + excluir sem confirmação.

#### Seleção múltipla (Projetos e Categorias)
- **Checkbox por linha.** Clicar em qualquer ponto da linha alterna a seleção; renomear e excluir param a propagação e continuam fazendo só o que prometem. Durante a edição inline a linha não alterna nada.
- **"Selecionar todos"** no topo da lista, com estado indeterminado quando a seleção é parcial. O rótulo também é clicável.
- **Exclusão em massa** sem confirmação (§1). O botão fica sempre no fluxo, invisível enquanto não há seleção — mostrar e esconder deslocaria a lista.
- **A seleção é sempre a interseção com o que está visível.** Filtrar não deixa selecionado nada fora da tela: como não existe desfazer, o número na barra tem de ser exatamente o que será apagado. A regra vive em `useMultiSelect` (genérico por id) — **não** reaproveitar `useTaskSendSelection`, que é acoplado a `TaskGroup` e dia (§9.4).

#### Categorias por projeto
- **Na linha do projeto**, uma pílula com a contagem (ou "todas") abre o bloco de associação. Ela
  fica **sempre visível**, ao contrário de renomear e excluir: carrega estado, e escondê-la no hover
  esconderia a informação junto com o controle.
- **Cada clique grava**, como o toggle de billable das listas de tarefas — não há botão de salvar.
- **"Desmarcar todas" aparece com mais de uma marcada** — com uma só, a própria caixa já é o botão.
  É o caminho de volta ao "oferece todas", e apaga também as do Monday, como a caixa individual.
- **Sem associação, o projeto oferece o catálogo inteiro** (§6.4). O bloco diz isso em texto: é o
  estado de todo projeto até alguém marcar algo, e sem a frase parece que a associação se perdeu.
- **As linhas semeadas pelo Monday aparecem marcadas e são removíveis**, mas a remoção vale só até a
  próxima varredura — para tirar de vez, remova o Activity Type do quadro. É esta tela a saída de
  emergência do filtro duro, e por isso ela existiu **antes** da semeadura.

#### Workspaces
- **Criar:** nome + seletor de cor. A cor sugerida é o primeiro slot ainda não usado da paleta e **não muda enquanto se digita** — só o seletor a altera.
- **Editar:** nome e cor inline.
- **Tornar ativo:** cada linha inativa tem a ação; havendo tarefa em execução, pergunta Concluída/Pendente antes de trocar.
- **Excluir:** abre modal com o destino obrigatório dos dados (mover para outro workspace ou apagar). **Exceção deliberada** ao §1 "exclusões sem confirmação" — um workspace pode guardar meses de horas e não há desfazer. Excluir o último é bloqueado.

---

### 5.7 Tela de Configurações

#### Geral
| Configuração | Tipo | Descrição |
|---|---|---|
| Iniciar na inicialização do computador | toggle | Registra o app no startup do SO |
| Timer ao vivo no ícone da bandeja | toggle | Mostra timer no system tray icon |
| Abrir acesso rápido ao iniciar | toggle | Exibe o Command Palette ao abrir o app (padrão: ativo). Sem atalho global padrão — configure um em Configurações → Atalhos, se desejar. |
| Fechar ao perder foco | toggle | Janela principal fecha ao perder o foco (padrão: desativado); Pin/Unpin na title bar suspende temporariamente |
| Descartar tarefas com menos de 1 minuto | toggle | Cancela automaticamente tarefas paradas em menos de 60 s (padrão: desativado) |
| Arredondar duração ao parar | toggle + slots + tolerância | `roundingEnabled` (padrão: desativado), `roundingSlots` (múltiplos de 5 até 60) e `roundingTolerance` em minutos. Ao parar, `computeRoundedDuration` encaixa a duração no slot; dentro da tolerância acima do slot inferior ela **fica** nele, acima disso sobe para o próximo. Os slots repetem a cada 60 min |
| Mostrar rail de integrações | toggle | Faixa à direita com atalhos das integrações conectadas (padrão: ativo). Aparece em **todas** as telas, inclusive na de Integrações — a redundância com os tiles dali não incomodou na prática, e o rail sumindo numa tela só fazia a faixa parecer instável |

> **A duração gravada manda sobre o intervalo início→fim, e é ela que a edição
> exibe.** O arredondamento reescreve **só** o `durationSeconds` e deixa o
> `endTime` no instante real da parada, então os dois divergem de propósito — e
> divergem também na tarefa **pausada**, onde o `stopTask` soma os trechos
> rodados em vez do intervalo. A duração gravada é a que aparece nas listas, nos
> totalizadores e nas exportações; o `EditTaskModal` era o único lugar que a
> recalculava de `fim − início`, mostrando um valor que o resto do app não mostra
> em canto nenhum e — pior — **regravando-o por cima ao salvar**, o que desfazia o
> arredondamento em silêncio para quem abriu o modal só para corrigir o nome.
>
> Agora o fim exibido é o **derivado** da duração gravada
> (`resolveRegisteredEndHHMM`), e salvar o grava assim. O preço, escolhido: o
> instante real da parada de uma tarefa arredondada ou pausada se perde ao
> salvar — em troca de os três campos, mantidos em sincronia pelo
> `useDurationSync`, nunca se contradizerem na tela. O `endTime` sobra como
> reserva para o registro sem duração gravada.

#### Overlay
| Configuração | Tipo | Descrição |
|---|---|---|
| Mostrar ao iniciar tarefa | toggle | Execution Overlay aparece ao iniciar tarefa |
| Opacidade em repouso | slider (%) | Opacidade do overlay quando não está em interação |
| Snap to grid | toggle | Encaixa overlay em grade ao soltar arraste |

#### Acessibilidade
| Configuração | Tipo | Status | Descrição |
|---|---|---|---|
| Tamanho da fonte | select: P, M, G, GG | ✅ implementado | Escala texto via `--app-font-size` CSS custom property |
| Tema | select: Azul, Verde, Escuro, Claro | ✅ implementado | Paleta de cores via CSS custom properties |

#### Atalhos globais
| Ação | Tipo | Descrição |
|---|---|---|
| Iniciar / Pausar / Retomar | hotkey input | Toggle de execução da tarefa |
| Parar | hotkey input | Para a tarefa atual |
| Mostrar / Ocultar overlay | hotkey input | Alterna visibilidade do overlay |
| Mostrar / Ocultar janela | hotkey input | Alterna visibilidade da janela principal |

#### Integrações externas

> **Cada integração trabalha num workspace do DeskClock, escolhido nela mesma.** `Workspace
> DeskClock` é o primeiro controle de cada card (no Google, de cada subseção — um card, duas
> chaves): `mondayDeskclockWorkspaceId`, `clockifyDeskclockWorkspaceId`,
> `sheetsDeskclockWorkspaceId`, `calendarDeskclockWorkspaceId`, `zendeskDeskclockWorkspaceId`. É
> dele que saem o destino dos imports e o recorte do envio — **a integração roda independente do
> workspace aberto na tela**, que era de onde vinham os dois defeitos silenciosos: importação
> nascendo onde a pessoa estivesse no instante do ciclo, e envio mandando ao board do cliente a
> hora do trabalho pessoal.
>
> **Vazio resolve para o "Padrão" na leitura** (`resolveIntegrationWorkspaceId`), e nada é gravado
> na montagem: o seletor **some com um único workspace** e quem nunca criou um segundo não percebe
> mudança nenhuma. No envio por tarefa, a de outro workspace é pulada **sem aviso** — o aviso diz
> "isto deveria ter subido e não subiu", e aqui nada deveria; era justamente o "o projeto não está
> mapeado" a cada parada num workspace pessoal que incomodava.
>
> **Os catálogos acompanham** (`useIntegrationCatalogs`): projetos e categorias dos modais de
> integração vêm do workspace dela, não do ativo. Sem isso o import criaria a planejada no
> workspace certo apontando para um projeto do errado, e a lista de envio exibiria o nome errado.
>
> Isto **revogou** a regra do §9.5 item 7 ("integrações enxergam tudo"), que era deliberada — ver a
> nota lá antes de "corrigir" código escopado.

> **Envio é parcial por natureza, e o `ITaskSender` passou a dizer isso.** O `send` devolvia `void`,
> então quem chamava só sabia distinguir "resolveu" de "lançou" — e marcava **tudo** ou **nada** como
> enviado. Mas a carga leva vários grupos e a recusa é **por grupo**: uma hora não faturável de
> cliente sem motivo (§ abaixo) fazia o Monday escrever os demais grupos no board e **ainda assim**
> lançar no fim, o que deixava nenhuma tarefa com o badge "Enviado", o timestamp do último envio
> parado e a tela dizendo "Não enviado ao Monday" — sobre horas que já estavam lá. Agora o retorno é
> `TaskSendOutcome { sentTaskIds, refused }`, e o `markSent` recebe só o que o sender confirmou.
>
> **O que lança e o que volta no outcome:** `throw` fica para o que impede o envio **inteiro** —
> integração não configurada, token ausente, nenhuma tarefa válida na carga —, porque aí não há
> resultado parcial a reportar. Recusa ou falha **de um grupo** volta no outcome e nunca é lançada,
> ou lançar apagaria o registro do que subiu no mesmo envio.
>
> **`refused` e `failed` são campos separados, e a separação é o que mantém os dois sinais.**
> `refused` é o destino não aceitando o **dado** — hora não faturável de cliente sem motivo, rótulo
> que não existe na coluna, board sem grupo para o Report Type: tentar de novo sem mudar nada dá no
> mesmo, e quem resolve é o usuário editando a tarefa. `failed` é falha **técnica** — rede, 5xx, a
> API recusando a escrita: não há nada a preencher, é para tentar de novo. Os dois viram canais
> diferentes: `refused` → `warning` (amarelo), `failed` → `error` (vermelho), que é a distinção que o
> `usePostStopLogic` já sabe exibir e que se perdeu quando os dois nasceram no mesmo campo — ali uma
> queda de rede aparecia como aviso amarelo, indistinguível de "preencha o motivo". Na tela do envio
> manual, **falha manda no tom mesmo com parte enviada**, e nada enviado é vermelho seja qual for o
> motivo. Já o timestamp não distingue: qualquer pendência o segura.
>
> **A falha de um grupo também não aborta os seguintes.** O `for ... await` cru do Monday e do
> Clockify parava no primeiro erro de rede: os grupos já escritos ficavam no destino, os seguintes
> nunca subiam, e no Monday o `removeOrphans` era pulado — deixando no board o item de um grupo que se
> fundiu, inflando o total reportado. No Clockify era pior, por não haver rastreamento de item: o
> reenvio **duplicava** as entries que já tinham subido. O Sheets fica de fora porque escreve numa
> requisição só — lá, tudo-ou-nada é a API, não a implementação.
>
> **Grupo que falhou não cobre nada, mas continua protegendo o que reivindicou.** No `removeOrphans`
> a cobertura sai dos planos aplicados e o `claimed` sai de **todos**: apagar o item que um grupo
> recusado reivindicou destruiria horas que nada reescreveu. E a limpeza roda **dentro de um `try`**:
> ela lança em qualquer erro que não seja "não encontrado", e solta isso descartaria o envio inteiro
> já gravado — higiene de board não pode custar o resultado do que o usuário mandou enviar.
>
> **Quem marca o badge "Enviado" é `resolveSentTasks` (`domain/utils/`), e no modo cru a marcação é
> exata.** A tentação é dar o grupo da tela por enviado quando *alguma* tarefa dele voltou
> confirmada, e está errado: o agrupamento da tela (§6.3) **não** inclui `billable` e o do Monday
> inclui, então um grupo com o indicador alternado na lista vira **dois** itens no board. Recusado o
> não faturável por falta de motivo e aceito o faturável, marcar o grupo daria o badge a horas que
> nunca chegaram lá — e o badge é justamente o que impede o reenvio. A contagem exibida é
> conservadora pela mesma razão: só conta grupo confirmado por inteiro.
>
> **O timestamp do envio diário só avança com o envio limpo.** `calcDailyRange` deriva o início da
> janela do dia local dele, então avançá-lo com algo recusado tiraria o grupo que ficou para trás da
> busca do ciclo seguinte — ele nunca mais seria tentado, sem badge e sem aviso. Parado, a janela só
> fica mais larga enquanto houver pendência: o `runDailyTemplate` exclui as já enviadas antes de
> agrupar e o Monday é upsert por assinatura, então repetir o dia não duplica. Vale também para o
> `onSendSuccess` do envio manual, que mexe na mesma chave.
>
> **A mensagem do resultado não é mais apagada pelo próprio reload.** O envio termina em
> `triggerReload()`, e o efeito de carga começava zerando a mensagem — a frase sumia no instante em
> que aparecia. Valia para o sucesso desde sempre, e passou a doer quando o resultado parcial virou a
> informação principal. Agora quem limpa é quem **troca o recorte** (`setQuick`, datas do período),
> porque aí a mensagem descreve uma lista que saiu de cena. Não use `useRef` para preservá-la: o app
> roda em `StrictMode` e o efeito é invocado duas vezes em dev.
>
> **Os três `runPerTask` conferem o resultado antes de marcar.** Com a recusa fora do canal de
> exceção, "não lançou" deixou de significar "subiu" — sem a conferência, a hora que o board recusou
> receberia o badge "Enviado" e nunca mais seria reenviada.
>
> Na tela, a mensagem ganhou um terceiro tom (`SendTone`): o desfecho que faltava era justamente o
> comum — parte sobe, parte é recusada —, e pintá-lo de vermelho negava o que já estava no destino.

**Google Sheets:**
| Campo | Tipo |
|---|---|
| ID da Planilha | text input |
| Sincronização automática | toggle (envia tarefa ao concluir) |
| Envio manual | botão na tela de Integrações para enviar tarefas selecionadas sob demanda |
| Autorização | botão OAuth |

**Google Agenda:**
| Campo | Tipo |
|---|---|
| Autorização | botão OAuth |
| Workspace DeskClock | dropdown (`calendarDeskclockWorkspaceId`). Governa **só** o "Importar eventos" |
| Rastrear reuniões automaticamente | toggle (`calendarAutoTrackingEnabled`, padrão desativado; requer Google conectado) |

> **A Agenda é a exceção ao workspace por integração, e a exceção foi escolhida.** O seletor dela
> vale só para o **"Importar eventos" manual**; o **rastreio automático de reuniões continua
> criando no workspace ativo**. Foi apontado ao usuário, na pergunta, que o mesmo modal também
> abria pelo Planejamento e passaria a importar para um workspace diferente do que a tela mostra —
> ele escolheu assim mesmo, e depois **removeu aquele botão** (§5.3): hoje o modal só abre pelo rail
> e pela tela de Integrações, onde o seletor está à vista. **Não "conserte" sem perguntar.** É por
> isso que só o `useMeetingTracker` mantém o gate de `workspaceLoading` (§ acima).

> **Rastreamento automático de reuniões:** quando ligado, `useMeetingTracker` (na main window, dentro do `RunningTaskProvider`) busca os eventos com horário do dia ao abrir o app e a cada 2 min, rastreando-os num store próprio da integração (`calendar_tracked_meetings` — a identidade do evento fica confinada aqui; `Task`/`PlannedTask` permanecem agnósticas). No horário de início (até 1 min antes) emite um prompt reutilizando a janela `overlay-popup`; confirmar inicia a tarefa via `RunningTaskContext.switchToTask` (encerra a corrente e inicia a da reunião). No término, pergunta se ainda está em andamento e re-pergunta a cada 15 min até encerrar — nunca para sozinho. A decisão de quando exibir cada prompt vive em use cases puros (`computeMeetingPromptActions`, `syncTodayMeetings`).

> **Reunião iniciada à mão é reconhecida, não re-perguntada.** O rastreamento só sabia da reunião
> iniciada pelo próprio prompt, então quem dava Play na planejada (popup, planejamento, omnibox)
> recebia o convite de início **a cada 5 min até o fim do evento** — e nunca o de término, que
> depende de `startedTaskId`. Agora, dentro da janela do evento, a tarefa em execução que é a reunião
> é **anexada** (`kind: "attach"` em `computeMeetingPromptActions`): grava `startedTaskId` em vez de
> perguntar, o que cala o re-prompt e habilita o de término.
>
> O reconhecimento é por **vínculo da planejada** (`activePlannedTaskId` do `RunningTaskContext` ==
> `plannedTaskId` da reunião) ou, sem vínculo, por **nome exato** — exato pela mesma razão da adoção
> de planejadas: anexar errado cala o início e para a tarefa alheia no prompt de término.
>
> **Só dentro da janela do evento**, e o caminho do nome exige ainda que a tarefa **tenha começado**
> dentro dela: uma "Daily" iniciada às 8h e ainda rodando às 10h não é a Daily das 10h, e anexá-la
> faria a parada dessa tarefa marcar a reunião como encerrada (via `RUNNING_TASK_CHANGED`), matando os
> dois prompts do dia. O vínculo da planejada dispensa essa segunda guarda — é a planejada *daquela*
> reunião, então tê-la iniciado adiantado é escolha, não colisão de nomes. **Pausada conta como em
> execução**: pausar no meio de uma reunião é corriqueiro, e perguntar "quer iniciar?" sobre a tarefa
> que está ali só faria o "sim" parar e recriar a mesma coisa. O `attach` vem **antes** da cadência
> de "perguntei há pouco": barrar por ela adiaria o reconhecimento justamente para o intervalo em que
> o prompt indevido dispara. Reunião dispensada não é anexada — "Dispensar" é decisão explícita.
>
> A escrita é `setStartedTaskId`, espelho de `setPlannedTaskId` e pelo mesmo motivo, no sentido
> inverso: o snapshot da reunião é anterior ao `plannedTaskId` que o ciclo de sync pode ter acabado
> de gravar, e um `upsert` de linha inteira o desfaria.

> **O vínculo manda, mas só dentro do workspace em que a tarefa vai nascer**
> (`resolveMeetingTaskDefaults`). O rastreamento é global — `calendar_tracked_meetings` não tem
> workspace —, enquanto a planejada é escopada, e **quem decide qual planejada a reunião adota é o
> ciclo de sync, com o workspace ativo *naquele* instante**: em geral logo depois da meia-noite,
> horas antes de o alerta tocar. Trocar de workspace no meio do dia bastava para o vínculo apontar
> para a cópia do outro, e o prompt colava na tarefa um `projectId` que **não existe** no catálogo
> ativo (§4.3) — a tela não acha o nome e o campo aparece **em branco**, exatamente como se nada
> tivesse sido copiado. Numa conta com as mesmas reuniões planejadas nos dois workspaces, e
> recorrentes entre elas, isso acontece todo dia.
>
> Fora do workspace, o vínculo cai para o **casamento por nome exato dentro do ativo** — o caminho
> principal antes de o vínculo existir, que volta como rede: é a cópia local que o usuário vê na
> lista do popup (escopada) e espera que o alerta use. Exato pela mesma razão da adoção de
> planejadas. Não achando nada, **nem o vínculo é gravado**: levá-lo adiante faria a parada concluir
> a planejada do outro workspace. A segunda consulta só acontece quando o vínculo falha.
>
> Isto **restaura** a guarda que existia antes de o casamento passar a ser por vínculo — a busca
> antiga era `findForDate(hoje, workspaceAtivo)`, escopada de propósito. A troca para `findById`
> ganhou robustez a renomeação e perdeu o escopo; agora tem os dois.
>
> **Os campos personalizados vão junto**, e é o que o comentário no código afirmava sem cumprir: o
> alerta copiava projeto e categoria e parava aí, então a reunião que adotou o item do Monday subia
> **sem o Project Stage** que o envio de horas exige, e o preenchimento voltava a ser manual todo
> dia. Eles também entram na chave de agrupamento (§6.3), como em todo início a partir de uma tarefa
> existente. Vão **copiados**, não por referência — o objeto segue para a tarefa nova, e partilhá-lo
> com a planejada faria uma edição na execução vazar para o molde sem passar por
> `applyRunningTaskEditToPlanned` (§4.1).

> **Rastrear e planejar são etapas separadas, e a planejada tem vínculo explícito**
> (`calendar_tracked_meetings.planned_task_id`). Enquanto a criação da planejada vivia dentro do laço
> que rastreia, ela só acontecia para evento novo **naquele ciclo**: o upsert do rastreamento gravava
> primeiro, e uma falha na criação deixava o evento marcado como visto para sempre — o prompt
> disparava no horário e a planejada nunca aparecia, nem reabrindo o app, porque o ciclo seguinte
> pulava o evento por já conhecê-lo. Agora `ensurePlannedTasks` parte de **toda** reunião do dia sem
> vínculo, então falha é nova tentativa no ciclo seguinte, e reunião que ficou sem planejada se
> recupera sozinha. O vínculo grava logo após cada criação: erro na terceira reunião não desfaz as
> duas primeiras nem marca a terceira como resolvida.
>
> `NULL` significa **ainda não tratada**; preenchido significa **tratada**, e continua assim mesmo
> que a planejada seja apagada depois — planejada apagada à mão não volta, nem quando a poda do
> Monday é que a apagou. A poda diária do rastreamento é o que mantém isso vivível: uma recorrente
> volta a ser avaliada na próxima ocorrência.
>
> O vínculo também substituiu o casamento **por nome** que o prompt fazia para copiar projeto e
> categoria: renomear a planejada não desfaz mais o pareamento.
>
> **O vínculo é gravado por `setPlannedTaskId`, não por `upsert`.** A escrita estreita não é
> economia: o `upsert` parte de um objeto lido no início do ciclo, e o prompt de reunião grava
> `startedTaskId` **fora** da guarda `inFlight`. Reescrever a linha inteira por cima devolveria
> `startedTaskId` a null no meio de uma reunião em andamento — o prompt de início seria reoferecido e
> o de término nunca dispararia.
>
> **Falha de uma reunião não aborta o ciclo.** Cada uma tem seu `try` e as mensagens voltam em
> `errors`: sem isso, um erro na terceira deixava a quarta e a quinta sem planejada e levava a poda
> diária junto.

> **Reunião e item do Monday para o mesmo trabalho não viram duas planejadas.** Existindo planejada
> de mesmo nome no dia — inclusive importada do Monday —, a reunião **adota** aquela em vez de criar
> outra. Sem isso sobravam duas linhas no planejamento, uma com o link do Meet e outra com o Project
> Stage que o envio de horas ao Monday exige; adotando, a mesma linha tem os dois. O nome usado é o
> **do evento**, não o da reunião rastreada, porque o reconcile pode tê-lo atualizado no mesmo ciclo.
>
> **Na adoção entra só o link de conferência, nunca o `htmlLink` do evento** — na criação o `htmlLink`
> segue valendo como reserva, porque a planejada nasceu daquele evento. A planejada adotada costuma
> ser de longa vida (recorrente, ou de período, como as que o Monday cria) e o rastreamento é podado
> todo dia: amanhã a mesma reunião volta a adotá-la. Como o `htmlLink` é único por ocorrência, o
> dedupe nunca casaria e a planejada acumularia uma ação por dia, indefinidamente. O link de
> conferência de uma recorrente é o mesmo em toda ocorrência — e é o único que serve para entrar na
> reunião.
>
> **O casamento é por nome exato, e de propósito.** Matching aproximado penduraria a reunião no
> trabalho errado em silêncio, num job de fundo, herdando projeto e etapa errados — duplicata visível
> é melhor que vínculo errado invisível. Nomes diferentes continuam gerando duas planejadas; a saída
> desenhada para isso é um apelido de agenda na planejada, ainda não implementado.

> **A falha do ciclo fica registrada** em `calendarLastSyncError` e aparece como frase abaixo do
> "Buscar eventos agora". O ciclo roda em segundo plano e engolia o erro com um `.catch(() => null)`:
> reunião que não virava planejada não deixava rastro nenhum, e a causa raiz do episódio de
> 2026-08-04 se perdeu por isso. A mensagem vem de terceiro, então é truncada antes de persistir, e a
> config só é escrita quando o valor muda — a cada 2 min, gravar sempre seria um `UPDATE` por ciclo
> sem nada novo a dizer.
>
> **Quem avisa a tela é o evento `MEETING_TRACKER_SYNC_RESULT`**, emitido em todo caminho de saída,
> como o `MONDAY_IMPORT_SYNC_RESULT`. Ler a config depois de um tempo fixo mostrava o estado anterior
> justamente quando a busca demorava, e um ciclo automático bem-sucedido nunca apagaria da tela um
> erro antigo.
>
> Os dois botões de "buscar agora" — este e o do Monday — compartilham o `useSyncNowButton` e a
> `SyncFeedbackLine` (§9.4). O **watchdog** dentro do hook não é detalhe: o rastreador registra o
> listener num efeito que espera config e workspace resolverem, então um clique nessa janela é
> emitido no vazio, e sem o corte por tempo o botão giraria até a tela remontar.

> **O rastreio de reuniões espera o workspace resolver, e o gate é no efeito.** Enquanto o
> `WorkspaceContext` carrega, o id ativo é o do workspace "Padrão" — um palpite, não uma escolha, e
> sincronizar antes criaria a planejada no lugar errado. O gate **não** pode ficar no `enabled()` de
> dentro do tick: ali ele não adiaria o primeiro ciclo por um tick, e sim pelo intervalo inteiro. No
> efeito, `loading` faz true→false uma vez por mount, o efeito reexecuta e o atraso inicial passa a
> contar da resolução.
>
> **Vale só para o `useMeetingTracker`**, e é consequência da exceção da Agenda abaixo: os
> rastreadores do Monday leem o workspace da **config** e não dependem mais dessa resolução — o gate
> deles saiu junto com o `useRef` que carregava o id ativo.

**Clockify:**
| Campo | Tipo |
|---|---|
| API Key | input password + instrução inline |
| Workspace DeskClock | dropdown com os workspaces do app (`clockifyDeskclockWorkspaceId`) |
| Workspace Clockify | dropdown (buscado via API). Chamava-se "Workspace ativo" — com o do DeskClock logo acima, "ativo" deixou de dizer qual dos dois |
| Importar projetos | botão → cria Projects no DeskClock + mapeamento automático |
| Importar tags | botão → cria Categories no DeskClock + mapeamento automático |
| Mapeamento de projetos | tabela DeskClock Project ↔ Clockify Project (por workspace) |
| Mapeamento de categorias | tabela DeskClock Category ↔ Clockify Tags (multi-select, por workspace) |
| Tags padrão | multi-select de tags sempre incluídas em todo envio |
| Sincronização automática | toggle + modo (por tarefa / diário) + gatilho (ao abrir / horário fixo) |
| Gerenciar apontamentos | botão abre modal com CRUD direto sobre as time entries do workspace ativo (filtro por período + filtro por tags padrão; entries em andamento são ocultadas) |

**Monday.com:**
| Campo | Tipo |
|---|---|
| API Key | input password + instrução inline |
| Workspace DeskClock | dropdown com os workspaces do app (`mondayDeskclockWorkspaceId`) |
| Board de Portfólio | input com o id do board que lista os projetos (`mondayPortfolioBoardId`) |
| Board de Report de Horas | input com o id do board que guarda o catálogo dos rótulos (`mondayReportBoardId`) |
| Importação de dados | seis blocos: Projetos, Catálogos, Categorias e os três campos de atividade (Project Stage, Report Type, Non Billable reason). O destino é o Workspace DeskClock da integração — o seletor local que existia aqui era estado de tela e morria ao sair |
| Sincronização automática | toggle + modo (por tarefa / diário) + gatilho (ao abrir / horário fixo) + "Sincronizar agora" no modo diário |
| Importação automática de itens | toggle (`mondayAutoImportEnabled`, padrão desativado) + botão "Buscar itens agora" |
| Enviar tarefas manualmente | botão abre o `TaskSendModal` genérico |
| Importar itens como planejadas | botão abre o `MondayImportModal` |
| Gerenciar atividades | botão abre o `MondayEntriesModal` |

> **No rail de integrações o Monday só aparece configurado ponta a ponta** (`isMondayReady`): chave
> de API, os **dois board ids** e ao menos um projeto **com quadro de destino**. Diferente do
> Clockify e do Google, a chave sozinha não torna a integração utilizável — sem os boards não há de
> onde tirar projetos nem rótulos, e sem quadro não há o que consultar. Projeto sem quadro é estado
> normal (a coluna "ID Quadro Projeto" está vazia em 14 dos 62 itens) e por isso **não conta**: as
> três ações do atalho consultam boards e abririam vazias, que é o que o atalho existe para evitar.
> A tela de Integrações continua acessível sempre, que é onde a configuração se completa.

> **Start Date e End Date são o intervalo trabalhado, não o do envio.** As duas colunas levavam o
> instante em que a atividade nasceu no Monday, o que descrevia o envio e não o trabalho: lançamento
> retroativo e envio diário caíam todos no dia em que se apertou o botão, e o filtro por período do
> gerenciador de atividades — que lê justamente este par (§ `parseDatePairPeriod`) — mostrava a
> atividade no dia errado. Agora vêm do grupo: início da primeira tarefa, fim da última. O fim é o
> **maior** `endTime`, não o da tarefa que começou por último — duas execuções do mesmo trabalho podem
> se sobrepor.
>
> Por virem da tarefa, o valor é estável entre execuções, e por isso **entram também no update**: era
> a volatilidade do "agora" que as obrigava a ficar só no create, sob pena de o payload mudar a cada
> ciclo e nenhum grupo cair mais no skip por "nada mudou". A consequência é que corrigir o horário de
> uma tarefa já enviada acerta a data no board — e que o primeiro envio depois desta mudança reescreve
> uma vez os itens já rastreados, que é o que conserta as datas antigas.
>
> **Vai só o dia, sem hora.** A hora acompanhava e descrevia o instante exato de início e fim —
> precisão que o board não usa: o que se reporta ali é o dia em que o trabalho aconteceu. O dia é o
> **local** (§6.6), não o dia em UTC: com hora junto o Monday guardava em UTC e reexibia no fuso da
> conta, então o dia se acertava sozinho; sem ela não há o que reconverter, e uma tarefa das 23h em
> fuso negativo cairia no dia seguinte do board. A leitura (`parseDayValue`) continua entendendo as
> duas formas, porque as atividades enviadas antes disso ainda têm hora gravada. Aqui também o
> primeiro envio reescreve uma vez os itens já rastreados.

> **O Report Type está adormecido, e toda atividade vai como `Activity`.** O time ainda não fechou
> o que cada valor significa, e um campo que ninguém sabe preencher mandaria hora para o grupo errado
> do board do cliente — onde ela não seria encontrada nem por quem a lançou. O card some de
> Integrações, o `MondayTaskSender.catalogFields` devolve o campo como `null` e o envio cai no padrão.
> **O que fica em volta continua vivo**: a chave `mondayReportTypeFieldId`, o catálogo lido do board
> de Report e os `reportTypeGroupIds` resolvidos no mapeamento — despertar não pode custar reler
> board nenhum. Acordar é ler a chave no sender e devolver o card na seção.
>
> **Quando acordar: o Report Type não é coluna no board do projeto — é o grupo em que a atividade
> nasce.** No board de Report ele é lido por uma automação que roteia o apontamento; escrevendo
> direto, o roteamento é nosso: `Activity → Activities`, `Meeting → Meetings`, `Expense → Expenses`,
> `Risk → Risks`, `Lesson Learned → Lessons Learned`. Tarefa sem valor no campo vale `Activity`.
>
> **A resolução é pelo título do grupo, nunca pelo id.** `group_mm19wbff` é "Timeline" num board de
> cliente e "Activities" no interno — casar por id gravaria as horas no cronograma do cliente. Board
> interno tem um grupo só, então lá só `Activity` resolve: os outros quatro **recusam o envio com
> mensagem**, em vez de cair no Activities calados, que reportaria como atividade o que o usuário
> classificou como reunião ou risco.
>
> **Mudar o Report Type depois do envio move o item.** Grupo não é coluna, então
> `change_multiple_column_values` não o alcança — sem o `move_item_to_group` o item ficaria em
> Activities para sempre. O grupo atual vem de graça no retorno da própria escrita, então só há
> requisição extra quando ele diverge; recriar o item para trocá-lo perderia as atualizações dele.
>
> **O recorte de grupos das duas telas cobre todos os destinos**, não só o Activities: a atividade
> criada em Meetings sumiria do gerenciador — que não a editaria nem a apagaria — e reapareceria no
> import como item de trabalho a virar planejada. `listItemsOwnedBy` continua separando as consultas
> por par (coluna de pessoa, grupos), porque id de grupo se repete entre boards.

> **O motivo de não faturável é obrigatório em projeto de cliente, e dispensado em interno.** Ali a
> hora não faturada é a exceção e a coluna existe para justificá-la; no interno non-billable é a norma
> (0 horas faturáveis em 119 itens). A tarefa sem motivo nessa situação **não sobe, com mensagem** —
> omitir em silêncio mandaria ao board de outra pessoa exatamente o que a coluna existe para impedir.
> **Board sem a coluna nunca exige**: a omissão precisa vir da ausência no schema (3 dos 4 boards
> internos não a têm), ou o cliente cujo board não a tem ficaria sem caminho nenhum para lançar hora
> não faturável.
>
> **Recusar um grupo não aborta o envio.** Os demais sobem e as mensagens voltam juntas num erro no
> fim: o `ITaskSender` só tem o `throw` como canal, e lançar antes de escrever faria uma tarefa travar
> o dia inteiro.
>
> **O Project Stage só entra em projeto de cliente**, agora por guarda explícita de escopo. Ela já não
> saía por acidente feliz — nos boards internos a coluna se chama "Project Phase" e não bate com os
> títulos procurados —, e a guarda é o que sobrevive ao dia em que alguém adicionar esse título à
> lista. Um rótulo de cliente ali derrubaria a mutation inteira.

> **Apagar no Monday é mandar para a lixeira.** O id continua válido e
> `change_multiple_column_values` responde **sucesso** num item que ninguém mais vê — nunca chega um
> `MondayNotFoundError`. Por isso o update pede `id state` e trata `state !== "active"` (deleted ou
> archived) como item perdido: larga a linha de `monday_activity_items` e cria outro no lugar, o
> mesmo desfecho do erro de não-encontrado. Sem isso o rastreamento aponta para a lixeira para
> sempre, e a atividade nunca volta ao board por mais que se reenvie.

> **O envio manual escreve sempre** (`forceWrite` do `MondayTaskSender`). O auto-sync pula o grupo
> cujo payload não mudou — é o que impede o envio diário de reescrever o dia inteiro a cada
> execução. No manual isso virava armadilha: atividade apagada direto no Monday nunca voltava,
> porque o rastreamento ainda batia, o envio era pulado em silêncio e o modal ainda dizia "enviado
> com sucesso". O clique é a intenção, então ali a comparação é ignorada — o item existente é
> reescrito e, se sumiu do board, recriado. **O aviso de reenvio avisa, nunca impede**, e basta
> **uma** tarefa já enviada na seleção para ele aparecer: exigir o grupo inteiro calava o aviso no
> caso mais arriscado, o grupo parcialmente enviado.

> **"Sincronizar agora" dispara só o Monday** (`AutoSyncRunner.runDailyFor`). O `runDaily` do
> runner roda todas as integrações com o modo diário ligado — o botão de um card mandaria tarefas
> para as outras sem ninguém pedir. O botão vive no `AutoSyncControls` compartilhado, atrás da prop
> opcional `syncNow`, e o modo diário é a condição para ele aparecer, como no Google Sheets: no modo
> por tarefa o envio já acontece ao concluir.

> **A configuração são dois ids de board**, e não cinco escolhas. Antes pedia workspace do Monday,
> pasta de clientes, pasta de projetos internos, board interno e um mapeamento manual board ↔
> Project — tudo para descrever à mão o que o próprio Monday já descreve. Hoje pede o **Portfólio**
> (`mondayPortfolioBoardId`, padrão `18418432045`), que lista os projetos, e o **Report de Horas**
> (`mondayReportBoardId`, padrão `18422834169`), que guarda o catálogo dos rótulos. Os dois vêm
> preenchidos com os ids da conta em que a integração foi desenhada e são trocáveis pelos campos da
> seção: outra conta troca os dois e o resto segue igual.
>
> **Desconectar não os apaga**: descrevem a conta, não a sessão, e limpá-los faria a reconexão exigir
> dois ids que ninguém tem à mão. `mondayUserId` continua derivado da apiKey no `MondayConnectModal`
> — é cache, nunca campo de tela.
>
> **O Report de Horas não é destino de escrita.** Criar item ali dispara uma automação que copia o
> apontamento para o board do projeto, mas **não** o atualiza nem exclui: editar ou apagar do
> DeskClock deixaria órfão o que foi copiado. Por isso as horas vão direto ao board do projeto, e o
> Report serve só de catálogo — é o único lugar onde os rótulos de cliente e os de projeto interno
> convivem.

> **Um item do Portfólio é um Project.** A coluna **Oferta** (`color_mm4fzw3r`) classifica:
> `Atividades Internas` é projeto **interno**, qualquer outro rótulo preenchido é **cliente**, e
> **vazia ignora o item** — é linha que ninguém classificou (2 dos 62 hoje), e adivinhar escolheria
> qual conjunto de Activity Type vale no board, que o Monday recusa se errado. O escopo fica no
> mapeamento (`scope`) porque decide os rótulos válidos e se o Project Stage entra no payload.
>
> A coluna **ID Quadro Projeto** (`text_mm5etnn2`) diz onde as horas são gravadas. **Vazia é estado
> normal** — 14 dos 62 itens estão assim: o projeto nasce, aparece e recebe tarefas; só as horas não
> sobem. O card de Projetos oferece um campo para digitar o id, que já lê o schema do board. No
> refresh o remoto só sobrescreve o local **quando vem preenchido**: vazio **nunca** apaga, ou a
> varredura diária desfaria o preenchimento manual todo dia.
>
> Os dois ids de coluna são **hardcodados**, ao contrário do resto da integração, que resolve coluna
> por título: os boards de projeto nascem de um template e cada um gera os seus ids, mas o Portfólio
> é um board só, escolhido por id — não há variação a acomodar, e resolver por título só criaria a
> chance de casar com a coluna errada.
>
> **Não há tabela de mapeamento** de categoria nem dos campos de atividade: o Activity Type é o
> **nome** da Categoria e os outros três são campos personalizados apontados por
> `mondayProjectStageFieldId`, `mondayReportTypeFieldId` e `mondayNonBillableReasonFieldId` — a
> tarefa grava o **id da opção**, e o sender traduz para o rótulo. Rótulo que não existe na coluna do
> board **não vai no payload**: o Monday recusaria a escrita inteira, derrubando um envio correto por
> causa de uma categoria não relacionada.

> **O import de projetos semeia quais categorias cada projeto oferece**
> (`seedMondayProjectCategories`, no botão "Atualizar", na varredura diária e **a cada abertura do
> app**, a partir dos vínculos já gravados). O
> board de destino já publica os Activity Types válidos, e o Activity Type **é** o nome da Categoria
> — então a associação não custa consulta nova: os rótulos vieram no `activityTypeLabels` do próprio
> import. O card de Projetos diz quantas foram semeadas, ou a escrita seria invisível.
>
> Fica **fora** de `importMondayProjects` de propósito: aquele use case já lê o Portfólio, cria
> projetos e resolve o schema de 62 boards, e juntar a escrita lhe daria dois repositórios a mais.
>
> **Board sem rótulo nenhum é pulado, não zerado.** `activityTypeLabels` vazio significa board
> ilegível ou projeto sem destino (14 dos 62), não "este projeto não aceita categoria nenhuma":
> chamar `replaceMondayFor` com lista vazia apagaria as associações a cada falha de leitura. É a
> mesma regra do "ID Quadro Projeto", onde vazio nunca sobrescreve o local. **Rótulo sem categoria
> correspondente é ignorado em silêncio** — quem cria categoria a partir do Monday é
> `importMondayCategories`, que pode não ter rodado ainda, e criar aqui duplicaria a regra de
> billable por escopo.
>
> **A semeadura não fica atrás do portão de uma vez por dia**, e essa foi a correção que o primeiro
> uso exigiu: presa à varredura, no dia em que a feature subiu — com a varredura do dia já feita —
> nenhum vínculo nascia até o dia seguinte, e a integração parecia não criá-los. Ela não fala com o
> Monday (os rótulos estão em `mondayProjectMapping` desde o último import), então roda também na
> abertura. O que a torna barata é **pular o projeto cujo conjunto não mudou**: depois da primeira
> vez o custo é uma leitura, e o aviso entre janelas só sai quando algo mudou de fato.

> **Uma leitura do board de Report semeia os quatro conjuntos de rótulos** (`importMondayFieldCatalogs`,
> card "Catálogos"): Activity Type (35), Project Stage (18), Non Billable reason (8) e Report Type
> (5). São quatro colunas do mesmo board, então quatro consultas seriam quatro idas ao Monday para
> montar campos que sempre se configuram juntos. Os ids dessas colunas são **hardcodados**, como os
> do Portfólio e pelo mesmo motivo — é um board só, escolhido por id, e ele tem outras quatro colunas
> `status` e três `dropdown` com que resolver por título poderia casar. Os rótulos ficam em
> `mondayFieldCatalogs`; sem o cache, abrir Integrações custaria uma consulta só para dizer quantos
> rótulos faltam em cada campo.
>
> **`status` e `dropdown` guardam os rótulos em formatos diferentes** — `{"labels":{"0":"Rótulo"}}`
> contra `{"labels":[{"id":1,"name":"Rótulo"}]}` — e passar um pelo parser do outro devolve lista
> vazia **sem erro nenhum**: a tela mostraria zero opções e a integração seguiria em pé. Daí
> `parseDropdownLabels` existir ao lado de `parseStatusLabels`. Rótulo desativado fica de fora, que é
> a mesma regra de nunca mandar valor que a coluna não aceita.
>
> **A lista de Activity Types é a união do catálogo com os rótulos cacheados nos boards**
> (`mergeLabels`), porque as duas metades cobrem buracos diferentes: o catálogo traz rótulo de board
> que ainda não foi importado ou não abre, e o cache traz rótulo que existe num board de projeto e
> não está no Report. O envio valida contra a coluna do board de destino, então rótulo a mais custa
> uma categoria não usada — rótulo a menos custa a coluna Activity Type em branco no apontamento.
>
> **O escopo de cada rótulo sai dos mapeamentos, não de uma consulta nova** (`billableByActivityType`):
> o import dos projetos já cacheou os rótulos de cada board junto do escopo que a coluna "Oferta"
> classificou. Cliente é billable, interno não; rótulo nos dois lados e rótulo que board nenhum
> confirmou ficam billable, porque trabalho de cliente é o caso majoritário e `default_billable` é só
> um padrão.
>
> **Não existe default de motivo de non-billable por categoria**, e por isso não há tabela lateral de
> categoria. O motivo é escolha da **atividade** — a mesma categoria rende hora faturável e não
> faturável, e "por que *esta* hora não foi faturada" não tem resposta no nível da categoria. Ele é
> **obrigatório** em projeto de cliente marcado como non-billable e **dispensado** em projeto
> interno, onde non-billable é a norma (0 horas faturáveis em 119 itens).
>
> **Os três são campos personalizados, e não colunas próprias em `tasks`.** Precisam ser editáveis no
> planejamento, no popup, no lançamento retroativo, na tarefa em execução, nos modais de edição, no
> acesso rápido, no import do Monday e na exportação — tudo que os campos personalizados já
> atravessam. Coluna nova exigiria reescrever o mesmo input em nove telas. O `MondayCatalogField` é
> um componente só para os três: eles diferem na chave de config e no catálogo, em mais nada.

> **Board ilegível não custa o Project.** A importação exigia as seis coisas do template e recusava
> o board na falta de qualquer uma — recusa sem alternativa: o cliente não virava Project, nada
> ficava mapeado e não havia caminho nenhum para enviar aquelas horas. Hoje só quatro impedem o
> **envio**: **grupo Activities**, **Reported Hours**, **Activity Type** e a **coluna de pessoa**. As
> três primeiras porque sem elas não há onde criar a atividade nem hora a registrar; a de pessoa
> porque é por ela que o gerenciador de atividades e o import de itens pedem ao Monday **só os itens
> do usuário**, e os boards são do time inteiro (§ abaixo). Faltando qualquer uma, o projeto nasce
> **sem destino** — o mesmo estado do item sem "ID Quadro Projeto" — e o motivo volta em `skipped`,
> visível no card de Projetos.
>
> **Billing type e Status são opcionais**, na mesma família de Project Stage e das duas datas: sem a
> coluna, o campo não entra no payload. A omissão é o mecanismo de segurança, não economia — id que
> o board não tem faz o Monday **recusar a mutation inteira** (HTTP 200 com
> `InvalidColumnIdException`/`ResourceNotFoundException` no corpo, nunca ignorado como na leitura), e
> o segundo desses o `MondayClient` traduz em `MondayNotFoundError`, que o sender lê como "apagaram o
> item" e responde **recriando**. Uma coluna a mais no payload viraria atividade duplicada no board a
> cada ciclo, não um erro visível. No gerenciador de atividades, o botão de faturável só aparece para
> board que tem a coluna: alternar um valor que nunca sairia dali é armadilha.

> **A lista de projetos se relê sozinha uma vez por dia** (`useMondayProjectsTracker`). Cliente novo
> só virava Project quando alguém lembrava de apertar "Atualizar" em Integrações, e enquanto ninguém
> lembrava a tarefa daquele board ficava sem projeto mapeado e as horas não subiam — falha silenciosa
> num caminho em que ninguém procura. O ciclo faz o que o botão faz, e **passa os vínculos atuais**
> ao importador: eles são a única fonte do quadro preenchido à mão, e sem eles a varredura apagaria a
> referência todo dia. O tique é de 30 min só para perceber a **virada do dia** (app aberto a semana
> inteira precisa notar sem ser reaberto) e a data só é gravada **depois do sucesso**: falha de rede
> volta a tentar no tique seguinte em vez de custar a varredura do dia.
>
> **O destino é o workspace da integração**, e por isso a varredura faz também o **primeiro**
> import. Enquanto o destino era o ativo, uma guarda provisória (`isMondayLinkedWorkspace`) só a
> deixava rodar onde já houvesse projeto do Monday — sem ela, bastava estar num workspace pessoal na
> virada do dia para os 60 projetos da empresa nascerem lá dentro. Com o destino escolhido, não há o
> que adivinhar, e a guarda saiu. O erro do ciclo fica em `mondayProjectsLastSyncError` e aparece no
> card de Projetos, pelo mesmo motivo do erro do rastreio da Agenda.

> **Os schemas dos boards são lidos em lote, uma vez por varredura.** Era um `getBoardSchema` por
> projeto, dentro do laço: ~46 idas **sequenciais** ao Monday, cada uma pedindo todas as colunas e
> todas as views com `settings_str` de um board de 60+ colunas. O board de destino passa a ser
> resolvido **antes** do laço, e `listBoardSchemas` quebra o resto em lotes de 20 — três requisições
> no lugar de quarenta e seis. Era o gargalo da varredura diária e do botão "Atualizar".
>
> **Board inacessível não vem no retorno, e é a ausência que vira o motivo em `skipped`**: a consulta
> em lote não falha por causa de um id ruim. O que falha — token, rede, orçamento de complexidade —
> **aborta a varredura**, e isso é a correção de um defeito silencioso: com a leitura por board dentro
> de um `catch`, um token vencido produzia 46 destinos vazios que o rastreador **gravava por cima** do
> mapeamento bom, e o envio de horas parava até a varredura seguinte dar certo. Abortar preserva o
> mapeamento.
>
> **O catálogo de projetos é lido uma vez, não um por item.** Eram ~60 `findByName` em série ao
> SQLite para montar um índice que uma leitura resolve — `findAll` já é escopado pelo workspace, que
> é exatamente o recorte da unicidade do nome (§4.3), e a coluna não tem `COLLATE NOCASE`, então o
> `Map` responde o mesmo que a consulta respondia. O `findByName` sobra só para a releitura do nome
> duplicado.
>
> **O nome é comparado aparado, porque é aparado que ele é gravado** (`createProject`). Comparando
> cru, o item do Portfólio com espaço na ponta não encontrava o projeto que ele mesmo criara no ciclo
> anterior: o `createProject` recusava por duplicidade, a releitura crua tornava a não encontrar, e
> aquele board voltava em `skipped` **a cada varredura** — sem mapeamento, e portanto sem envio de
> horas.

> **O schema de cada board vale 7 dias** (`schemaReadAtISO` + `shouldReadBoardSchema`), e depois da
> primeira varredura o normal é **nenhuma** leitura de schema. O mapeamento já era um cache do que a
> leitura devolve — grupos, colunas, rótulos, `timelineColumnId` —, mas faltava marca de validade:
> sem ela a varredura diária não distinguia board novo de board lido há uma hora, e pagava as três
> requisições mais caras da integração todo dia. Relê quando o vínculo é novo, quando o board de
> destino mudou (inclusive o id digitado à mão), quando a marca não existe (vínculo anterior a este
> cache) e quando ela vence. **O item do Portfólio continua sendo lido em toda varredura** — é dele
> que vêm o cliente novo e o "ID Quadro Projeto" recém-preenchido, e ele custa uma requisição de duas
> colunas. A validade existe pelos **rótulos**: a topologia de um board nascido de template não muda,
> mas Activity Type e etapa novos aparecem.
>
> **O vencimento não é escalonado entre os boards, e a conta é o motivo.** Espalhar para "não
> vencerem todos no mesmo dia" sai mais caro: o lote é de 20 ids, então 46 boards vencendo juntos
> custam 3 requisições **uma vez por semana**, contra ~7 boards/dia custando uma requisição **todo
> dia**. E o pior dia sem escalonamento é exatamente o que a varredura custava todo dia antes disto.
>
> **Só sucesso estampa.** Board fora do template, ou que não voltou na consulta, fica sem marca e é
> relido na varredura seguinte. Estampar a falha faria a recuperação de um board consertado no Monday
> levar uma semana e — o pior — o sumiria da lista de "fora do template" do card de Projetos, que só
> reporta o que foi lido **nesta** varredura. É a mesma disciplina de estados do `timelineColumnId`:
> ausente significa "nunca lido com sucesso", e por isso `normalizeProjectMappings` também não lhe dá
> default.
>
> **O "Atualizar" ignora a validade** (`forceSchemaRead`), no mesmo papel que o `forceWrite` tem no
> envio manual de horas: o clique é a intenção, e é o caminho de quem acabou de criar um rótulo no
> board e quer vê-lo agora. O risco aceito é o rótulo novo levar até 7 dias para aparecer sozinho —
> no envio, o pior caso é a coluna Activity Type em branco, não mutation recusada, porque o sender já
> omite rótulo que não está na lista cacheada.
>
> **Board relido que não volta na consulta perde o destino cacheado**, de propósito: a ausência é o
> Monday dizendo que aquele id não existe mais ou saiu do alcance do token, e insistir com o cache
> faria o envio escrever num board perdido. Falha de rede é outro caso — ela aborta a varredura antes
> disso e preserva o mapeamento inteiro (§ acima).

> **Os lotes correm em paralelo, com teto** (`mapWithConcurrency`, `BATCH_CONCURRENCY = 4`). O lote
> existe para caber no orçamento de complexidade, não porque um dependa do outro — mas o `for` com
> `await` fazia as três requisições esperarem umas às outras, e o mesmo valia para a busca de itens
> das duas telas. **A ordem do retorno continua sendo a da entrada**, nunca a de chegada: a lista
> sairia embaralhada de um jeito diferente a cada execução. O teto existe porque o número de lotes
> cresce com os boards mapeados, e disparar todos de uma vez contra uma API com limite de requisições
> troca lentidão por 429 intermitente — que é pior, por ser aleatório.

> **A requisição se repete no que for recusa temporária, e só nisso** (`retry.ts`, até 3 tentativas).
> É o contrapeso do paralelismo acima: mais requisições ao mesmo tempo tornam o 429 provável, e sem
> nova tentativa o ganho de tempo viraria erro intermitente na tela.
>
> **A regra que governa tudo é se a requisição é uma `mutation`.** Ela **não** se repete em 5xx nem
> em falha de rede: nos dois a escrita pode ter acontecido e só a resposta se perdeu, e repetir
> criaria a atividade duas vezes no board do cliente — o defeito que o rastreamento de itens existe
> para evitar. Já o 429 e o estouro de complexidade são recusas **antes** da execução: nada foi
> gravado, e ali a mutation repete como qualquer leitura. A pergunta é respondida pelo texto da
> query, que nasce toda dentro do `MondayClient`.
>
> **Prazo declarado é obedecido, e prazo longo demais é motivo para desistir na hora.** O
> `Retry-After` e o "reset in N seconds" da mensagem de complexidade viram a espera; acima de 15 s,
> o erro sobe imediatamente dizendo em quanto tempo tentar de novo — boa parte destas chamadas está
> atrás de um spinner de modal, e um minuto de giro não é nova tentativa, é janela travada. O jitter
> de ±25% existe porque os lotes paralelos tomam 429 juntos e voltariam juntos, reproduzindo a
> rajada que os derrubou.
>
> **5xx virou classe própria** (`MondayServerError`). Caía no `MondayValidationError`, que por
> definição não se repete — os dois pedem coisas opostas: o de validação diz que a query está errada
> e repeti-la só repete o erro. Enquanto eram a mesma classe, não havia como escrever a distinção.
>
> **A causa técnica aparece no tooltip do ícone de erro** (`errorDetail` + `SyncFeedbackLine`). O
> `originalCause` do `MondayNetworkError` era guardado e **nunca exibido nem registrado** — e
> "verifique sua internet" é o mesmo texto para DNS, proxy corporativo e certificado recusado. Ele
> fica **fora** da frase de propósito: quem lê a linha quer saber se funcionou, e um `TypeError:
> Failed to fetch` no meio dela não ajuda ninguém a decidir o que fazer. No ícone, quem não procura
> não vê. O helper cala quando a causa só repete a mensagem já visível, que seria ruído com cara de
> informação, e lê `cause` **e** `originalCause` — o padrão da linguagem é ES2022 e o projeto compila
> ES2021, então migrar a `lib` ficaria fora do escopo desta mudança.

> **O detalhe do Monday acompanha a recusa de credencial, sem substituir a sugestão.** 401 e 403
> chegam pela mesma porta e a mensagem virava "Token inválido ou revogado. Reconecte." mesmo quando o
> texto deles dizia *sem acesso a este board* — mandar reautenticar por falta de permissão é conselho
> errado. Agora a sugestão fica e o detalhe entra entre parênteses, com o status.

> **A coluna de cronograma é cacheada no mapeamento** (`timelineColumnId`), e é o que dispensa o
> ciclo de importação de reler schema nenhum. Ele lia o schema de **todos** os boards mapeados a cada
> execução — a requisição mais cara da integração — só para extrair este id, que a varredura de
> projetos já tinha em mãos: ela lê o mesmo schema para resolver grupo, colunas e rótulos.
>
> **Os três estados são distintos, e é isso que faz o cache funcionar** (`resolveTimelineByBoard`):
> `undefined` = nunca resolvido, e **só ele** manda ler o schema; `""` = lido, board sem coluna de
> cronograma; preenchido = o id. Colapsar os dois primeiros faria o board sem Timeline pagar a leitura
> para sempre — ou, na direção oposta, faria todo board parar de reler quando devia. Por isso
> `normalizeProjectMappings` **não** lhe dá default: o default seria o colapso.
>
> Board que não serve de destino também guarda o cronograma quando o schema foi lido — ele continua
> valendo para o import de itens de trabalho, e sem gravar o id ele releria o schema em todo ciclo.
> A regra é usada pelo automático e pelo `MondayImportModal`, que precisam concordar (§9.4).

> **As duas telas mostram só os itens do usuário conectado.** Os boards são do time inteiro, e
> ninguém trabalha em todos os clientes. O filtro é a regra `person-<id>` de `query_params` — o
> prefixo é obrigatório, mandar só o id devolve zero itens sem erro nenhum para avisar. A busca é
> `listItemsOwnedBy`, compartilhada pelas duas (§9.4).

> **Id de grupo se repete entre boards com significados diferentes.** `group_mm19wbff` é o grupo
> "Timeline" num board de cliente e o grupo "Activities" no board interno. Por isso
> `listItemsOwnedBy` separa as consultas por par **(coluna de pessoa, grupo Activities)** e cada
> lote leva o **seu** id: a união numa consulta só apagaria o Timeline de todo cliente
> (`not_any_of`) ou traria o Timeline como se fosse atividade (`any_of`). Nunca una ids de grupo de
> boards diferentes.

> **Importar itens (`MondayImportModal`):** **todos** os boards mapeados numa visão só, agrupada
> pelo **Project do DeskClock** — não há seletor de board. Entram os itens **fora** do grupo
> Activities e **do usuário**, e viram PlannedTasks no workspace ativo. O agendamento vem da coluna
> **Timeline** do item (resolvida pelo título, porque o board tem várias colunas desse tipo e a
> primeira é a realizada): um dia vira `specific_date`, vários viram `period`, ausente cai no dia
> corrente. Os schemas são buscados antes dos itens — em lote, `listBoardSchemas` — justamente para
> resolver esse título e então pedir só as colunas usadas; o template tem mais de 60. Filtro de
> período (Hoje / Esta semana / Próximos 30 dias, padrão Esta semana) recorta **o que já veio**, sem
> nova ida ao Monday, e por sobreposição: um item de 23/07 não polui o planejamento de agosto. As
> janelas só olham para a frente e **não há "Tudo"** — planejamento é futuro, e a busca já traz tudo
> o que é do usuário numa vez só. **Item sem cronograma aparece em qualquer recorte** — ele nasce no
> dia corrente, e escondê-lo por falta de data seria escondê-lo para sempre. Na linha expandida, a
> categoria vem pré-selecionada pelo Activity Type do item (com o billable acompanhando, §6.2) e o
> **Project Stage** pela coluna homônima. A etapa é campo personalizado desde a Fase 4, mas aparece
> aqui — e é o único que aparece — porque o Monday a exige no envio das horas: importar sem ela é
> adiar um preenchimento que ninguém faz depois. Some, com um aviso apontando para Integrações,
> enquanto `mondayProjectStageFieldId` não apontar para um campo ativo. Só aparecem boards cujo
> Project existe no workspace ativo, e o botão importa só o que está visível (§5.6).
>
> **Item que já tem planejada viva não aparece** (`findImportedMondayItems`), e o rodapé diz quantos
> ficaram de fora. Reimportar não duplicaria só a tarefa: o `upsert` do vínculo passaria a apontar
> para a cópia, e a planejada original ficaria órfã do sync — nunca mais atualizada nem podada. O
> badge "já existe" não cobre isso, porque compara **nomes** e renomear a planejada o apaga. **Item
> cuja planejada foi apagada à mão continua na lista**: ali não há duplicata a evitar, e este modal
> é a única volta — o automático nunca recria o que o usuário apagou.

> **Importação automática (`useMondayItemTracker` + `syncMondayPlannedTasks`):** ao abrir o app e a
> cada **4 h**, faz sozinho o que o modal faz à mão — a mesma busca, os mesmos padrões
> (`buildImportRows`/`resolveItemDefaults`, compartilhados com o modal, §9.4) — para a **semana
> corrente**. Sem prompt: é o rastreamento de agendas do Google levado ao Monday, e não há nada a
> perguntar.
>
> **O intervalo é de 4 h porque este é o ciclo mais caro da integração**, e item de board não muda
> de meia em meia hora: uma varredura custa a leitura dos schemas de todos os boards mapeados mais
> uma busca de itens por variação de template. Quatro horas cobrem o dia de trabalho em três
> varreduras, e **a atualização pontual continua sendo o "Buscar itens agora"**, que dispara este
> mesmo ciclo sob demanda — é ele, e não o relógio, o caminho de "acabaram de me passar uma tarefa".
> Não confundir com o tique de 30 min do `useMondayProjectsTracker`: aquele não vai à rede, só
> percebe a virada do dia.
>
> **"Buscar itens agora" espera a busca de verdade.** O botão vive nas Configurações e a busca vive
> no rastreador, na janela principal: o fim chega pelo evento `MONDAY_IMPORT_SYNC_RESULT`, que o
> rastreador emite em **todo** caminho de saída — erro, nada a fazer e até "não estou conectado" —,
> ou o botão ficaria girando para sempre. O resultado aparece como frase abaixo do botão, além do
> toast, porque o toast some e a Configurações é onde se confere se a integração está de pé.
>
> **O que dedupe é a tabela `monday_imported_items`**, chaveada por (item, workspace) e guardando um
> **snapshot** do item no último sync. O nome não serve: renomear a planejada aqui a faria ser
> criada de novo. **O import manual grava o mesmo vínculo** — sem isso, a varredura seguinte
> recriaria tudo o que o usuário acabou de importar pelo modal.
>
> **A atualização é campo a campo, contra o snapshot.** Só o que mudou no Monday é reescrito, então
> a edição local sobrevive enquanto o board não tocar naquele campo. Activity Type novo arrasta a
> categoria e o billable (§6.2); Activity Type que não casa com categoria nenhuma **limpa** o campo,
> porque manter a anterior afirmaria algo que o board deixou de dizer. A janela recorta só a
> **criação** — uma planejada existente acompanha o item para onde ele for remarcado.
>
> **Item que sumiu da busca** (excluído, reatribuído ou movido para o grupo Activities) leva junto a
> planejada, desde que ela nunca tenha sido concluída; o que já foi trabalhado fica. **A poda só
> olha boards do mapeamento atual** — sem essa guarda, desvincular um board apagaria em massa
> planejadas de itens que continuam vivos lá. E **planejada apagada à mão não volta**: o vínculo
> permanece, com o snapshot em dia, para o item não gerar tarefa outra vez.

> **Gerenciar atividades (`MondayEntriesModal`):** período + boards mapeados → itens do grupo
> Activities, **apenas os do usuário conectado** — os boards são compartilhados. Todos os boards vão
> numa **consulta só** (`listItems(boardIds)`, em lotes de
> 20): uma requisição por board mapeado dispara dezenas de chamadas paralelas para descobrir que
> quase todas voltam vazias. O filtro de janela é por **sobreposição** do intervalo Start Date → End
> Date, não por data de início: uma atividade de 01/07 a 28/07 pertence a todo dia do meio — e fica
> no cliente, porque as regras do Monday não expressam "intervalo que cruza o período" e o intervalo
> mora em duas colunas separadas. Editáveis: nome, horas, billable, Activity Type e Project Stage —
> as datas não, porque marcam o envio. **Excluir também apaga a linha de `monday_activity_items`**;
> sem isso o envio seguinte encontra rastreamento órfão e repete `MondayNotFoundError` a cada
> execução.
>
> **Excluir uma atividade pede confirmação**, contra o §1 e como a exclusão de workspace (§6.7). É a
> segunda exceção deliberada, e pela mesma razão: a linha não é do DeskClock, é um item no board do
> cliente, e apagá-la não tem desfazer nem daqui nem de lá — o que a lixeira do Monday devolve é um id
> que este app já esqueceu. A pergunta é sim/não e fica **na própria linha**, não em modal: o que se
> apaga precisa continuar à vista enquanto se responde (o modal do workspace existe porque lá há um
> destino a escolher). Com a pergunta aberta o bloco de ações fica fixo — some no hover, ele seria
> armadilha nova.
>
> **A lista some o item na hora, sem rebuscar.** O toast dizia "excluída" com a linha ainda na tela: a
> rebusca é que mandava, e ela vinha depois. Rebuscar também reabria a porta para o item voltar — a
> exclusão no Monday não fica visível na consulta seguinte na hora. O que se sabe está decidido no
> `await`; a rebusca fica no botão de recarregar, que é travado (com as pílulas) enquanto a exclusão
> corre.

> **Uma busca serve as quatro janelas, e ela tem um piso.** Como a consulta não filtra por data,
> trocar de janela refazia a mesma ida ao Monday para receber os mesmos itens; agora o período
> recorta só o que já veio, e 30 dias já contém 7 dias e hoje — o mês idem. Mas sem piso a consulta
> baixava **todas** as atividades já enviadas em todos os boards mapeados, desde sempre, e a
> paginação é serial: mais um ano de uso, mais páginas em série a cada abertura do modal. O
> `searchFloorDayISO` é a mais antiga das quatro janelas — no dia 31 o começo do mês, no dia 1º os 30
> dias — com uma semana de folga, que absorve o par de datas invertido à mão no board (a tela o
> desvira, a regra do Monday não) e a virada do dia com o app aberto.
>
> **O recorte é numa coluna só, End Date, e é teto de idade — não o filtro exato.** As regras de
> `query_params` se combinam com **E**, então "cruza a janela" continua sendo impossível de
> expressir; o `periodOverlaps` segue mandando na tela. O id da coluna entra na **chave do lote** do
> `listItemsOwnedBy` pela mesma razão que o id do grupo: regra apontando para coluna que um dos
> boards do lote não tem faz o Monday recusar o lote inteiro. **Board sem a coluna vem sem teto**, em
> lote próprio. E a data vai como `["EXACT", "AAAA-MM-DD"]` — sem o prefixo a API recusa a
> requisição. As janelas são **prontas** (Hoje / 7 dias /
> 30 dias / Este mês): o personalizado não abria nada que elas não cubram e custava dois campos de
> data mais um estado inválido para a tela tratar. Enquanto a busca corre — abertura e botão de
> recarregar — as pílulas ficam **travadas**, ou dá para pular de janela em janela e cada clique
> reordena a lista sob o cursor.

#### Feedback
- Botão na **sidebar** (não dentro das configurações) que abre URL externa no navegador padrão para envio de feedbacks, bugs, sugestões.
- Implementado via `tauri-plugin-opener` (`openUrl`).
- Posição: rodapé da sidebar, ícone `MessageSquare` (Lucide).

---

### 5.8 Tela de Lançamento Retroativo

> **Decisão de produto:** O lançamento retroativo era originalmente especificado como um modal na Tela de Tarefas. Foi convertido em tela dedicada acessível pela sidebar para permitir entrada rápida em sequência de múltiplas tarefas sem fechar e reabrir o fluxo.

- **Acesso:** Ícone `FileClock` na sidebar.
- **Navegação de data:** Setas ← → e DatePickerInput. Não é possível avançar além de hoje.
- **Layout em duas colunas:** formulário fixo à esquerda (`RetroactiveEntryForm`, coluna estreita e rolável), lista do dia à direita. Empilhados, os campos personalizados faziam o formulário crescer sem limite e empurravam os apontamentos para fora da tela. A coluna **recolhe e é arrastável** como a do Planejamento (§5.3) — e **reabre sozinha** quando algo pré-preenche o formulário (deeplink de lançamento, botão de uma planejada sem horário): preencher campo escondido não mostraria nada.
- **Formulário de criação inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, Hora início, Hora fim, Duração e os campos personalizados ativos. Criação sem modal; edição de registros existentes abre `EditTaskModal`.
- **Rótulo flutuante nos campos personalizados:** o rótulo começa dentro do campo, como placeholder, e sobe para a borda ao focar ou quando há valor — parando na mesma posição do rótulo encaixado de Início/Fim/Duração. Vale só para os campos personalizados, porque são os únicos dinâmicos: "Project Stage" não se explica pela posição no formulário como Nome e Projeto se explicam, então precisa continuar legível depois de preenchido. Os dois modos anteriores (`labelsAsPlaceholder` e rótulo-acima) foram removidos: o flutuante serve à coluna estreita e ao modal. O checkbox é a exceção — não há onde flutuar, o rótulo fica ao lado da caixa.
- **Modo de duração:** Toggle "Hora fim" / "Duração". Na duração, aceita `HH:MM:SS`, `MM:SS` ou inteiro (minutos).
- **Overnight:** Se hora fim < hora início, considera-se que a tarefa cruzou meia-noite — end é atribuído ao dia seguinte.
- **Cadeia de horários:** Após adicionar uma tarefa, o campo "Início" da próxima é automaticamente preenchido com o fim da tarefa recém-criada.
- **Tecla Enter:** Cria a tarefa (exceto quando autocomplete está aberto — nesse caso, seleciona o item).
- **Lista de tarefas do dia:** Tarefas completadas do dia selecionado, ordenadas da mais recente para a mais antiga.
- **A lista "Planejadas para este dia" é redimensionável na vertical** (`anchor: "top"`), pelo divisor que substituiu o `border-b` da seção. O valor gravado (`retroactivePlannedHeight`, padrão 144 px — o antigo `max-h-36`) é **teto, não altura**: com duas planejadas a seção continua encolhendo até o conteúdo, e altura fixa deixaria espaço vazio todo dia.

> **O teto do arraste é o conteúdo medido**, não o limite duro de 480 px. Passado o fim da lista
> não há mais nada a revelar, e deixar o divisor seguir o cursor no vazio faz o gesto parecer
> quebrado: arrasta-se 200 px, nada se move, e o caminho de volta só responde depois de recuperar
> os mesmos 200 px. Parar onde a lista acaba é a mesma resposta de bater no máximo. A medição é o
> `scrollHeight` num `useLayoutEffect`, e o `max` passa por um `Math.max(min, …)` porque com uma
> planejada só o conteúdo fica **abaixo** do mínimo e inverteria os dois limites do clamp.
>
> A preferência gravada **não** é re-clampada quando o conteúdo encolhe: 400 px escolhidos num dia
> cheio de reuniões voltam a valer no próximo dia cheio, mesmo tendo passado por dias de duas
> planejadas.

  - Botões por linha: Editar (abre `EditTaskModal`) | Excluir (sem confirmação).
  - **Seleção múltipla** pela barra "Selecionar tarefas", acima da lista: excluir em massa e **Mover para workspace**, este só com mais de um workspace (`MoveToWorkspaceModal`, o mesmo do Histórico e das entradas de hoje). O mover estava nas outras duas listas de tarefas e faltava só aqui — a barra idêntica à do Histórico fazia a ausência parecer feature desativada.
- **Total do dia:** Exibido no header quando há tarefas.

---

### 5.9 Primeira execução (`SetupModal`)

Dois passos, e o primeiro é o mesmo de sempre: o nome, usado na saudação da tela de Tarefas
(`userName`). Concluir grava `setupCompleted`, que é o que faz a janela abrir no tamanho de setup
(`useStartupWindow`) enquanto for falso.

> **O onboarding não cadastra mais projeto nem categoria — ele sugere conectar uma integração.** Os
> dois passos de importação em massa pediam, na primeira tela do app, exatamente a lista que o
> Monday, o Clockify e o Google entregam prontos — e quem os digitava ali acabava com um catálogo
> paralelo ao que o import criaria depois, com os mesmos nomes escritos de outro jeito e nenhum
> vínculo com o board de origem. Quem não usa integração nenhuma não perdeu caminho: a importação em
> massa continua na tela de Dados (§5.6), que é onde ela sempre esteve e para onde o texto do passo
> aponta.
>
> **O passo é um cartaz, não uma tela de conexão**, e é o que a arquitetura permite: os modais de
> integração vivem no `IntegrationsModalsHost`, que só é renderizado depois que o setup termina.
> Daí ele ter um destino só — o botão primário conclui o setup e **abre o app já na tela de
> Integrações**, passando a página pelo `onComplete`. "Agora não" conclui e abre em Tarefas.
>
> Enter segue o botão primário (§8.2), então também leva a Integrações. A lista das quatro
> integrações fez o passo ficar mais alto que a janela de 620 px em que o setup abre, e por isso o
> conteúdo rola em vez de centralizar rígido.

---

## 6. REGRAS DE NEGÓCIO

### 6.1 Tarefa em execução
- Apenas uma tarefa pode estar em execução por vez.
- Não é possível iniciar nova tarefa enquanto houver uma em execução — é necessário parar a atual primeiro.
- Timer começa imediatamente ao clicar "Iniciar", sem exigir dados.
- Pausar preserva a duração acumulada. Retomar continua de onde parou.

### 6.2 Billable
- Ao selecionar uma Categoria, o campo billable é preenchido com `category.default_billable`.
- O usuário pode sobrescrever manualmente a qualquer momento.
- Na lista de entradas, um clique no indicador billable alterna o valor.

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
- Ao iniciar uma tarefa planejada via Play, as ações configuradas **não são executadas automaticamente**. Elas aparecem como chips clicáveis na seção "Ações" do Popup Flyout enquanto a tarefa estiver em execução, permitindo que o usuário dispare cada uma sob demanda (e mais de uma vez, se quiser).
- Cada chip mostra um ícone (globo para URL, pasta para arquivo) e um rótulo curto (hostname para URLs, nome do arquivo para caminhos).
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

## 7. FLUXO DE TRABALHO DE DESENVOLVIMENTO

### 7.1 Ciclo por feature

```
1. PLANEJAR    → Detalhar tela/feature com base nesta spec. Documentar decisões.
2. APROVAR     → Submeter plano para revisão antes de implementar.
3. TESTAR      → Escrever testes primeiro (TDD): unit tests para domain/usecases, integration para infra, e2e para fluxos críticos.
4. IMPLEMENTAR → Código de produção que faz os testes passarem.
5. VALIDAR     → App deve compilar e executar sem erros após cada implementação.
6. FORMATAR    → Antes de commitar tudo o que foi produzido, rode o lint para garantir padrão de estilo do código.
7. COMMITAR    → Commits semânticos (feat:, fix:, refactor:, test:, docs:, chore:).
8. MERGEAR     → Branch por feature → merge em main.
9. LIMPAR      → Após o merge, verificar branches já mergeadas e sugerir exclusão ao usuário:
                 git branch --merged main | grep -v '^\* \|  main$'
```

### 7.2 Regras de branch
- `main` → sempre estável e buildável.
- `feat/<nome>` → desenvolvimento de nova funcionalidade.
- `fix/<nome>` → correção de bug.
- `refactor/<nome>` → refatoração sem mudança de comportamento.

> **Ao criar uma nova branch:** verificar primeiro se há branches já mergeadas pendentes de exclusão (`git branch --merged main`) e sugerir limpeza ao usuário antes de prosseguir.

### 7.3 Commits semânticos
- `feat: add task timer overlay`
- `fix: correct duration calculation on pause/resume`
- `test: add unit tests for ExportProfile use case`
- `docs: update CLAUDE.md with export profile schema`
- `chore: configure eslint rules`

### 7.4 Build
- Gerar builds para: Windows (.msi/.exe), Ubuntu (.deb/.AppImage), Arch Linux (.pkg.tar.zst/AppImage).
- Configurar `tauri.conf.json` para targets multiplataforma.

### 7.5 Documentação contínua
- **CLAUDE.md** (este arquivo): Atualizar sempre que padrões, decisões ou modelos mudarem.
- **README.md**: Manter atualizado com funcionalidades, setup local, como contribuir, e como buildar para cada plataforma.

### 7.6 Estratégia de testes

O projeto adota testes **unitários** com Vitest, focados nas camadas testáveis sem dependências de runtime externo (Tauri, DOM, rede).

**O que testamos:**
- `domain/usecases/` — lógica de negócio pura com repositório mockado (`vi.fn()`)
- `infra/database/` — repositórios SQLite com `getDb()` mockado via `vi.mock`
- `infra/integrations/google/` — funções utilitárias puras (ex: `parseRRuleDays`)
- `shared/utils/` — funções utilitárias sem side-effects
- `presentation/hooks/` — hooks cuja lógica decide dados, com `renderHook` (ex:
  `useMultiSelect`, que define o que uma exclusão sem confirmação apaga)

> **Corrigido em 2026-07-31.** Esta seção afirmava que `@testing-library/react` "não está
> configurado". Ele está no `package.json` desde antes e já era usado em
> `src/tests/presentation/contexts/ConfigContext.test.tsx` — a afirmação levava agentes a pular
> teste de hook achando que a ferramenta não existia.

**O que não testamos (e por quê):**
- Renderização de componentes React — decisão de custo, não de ferramenta: a asserção é sobre
  markup, que muda a cada ajuste visual. Se a lógica valer teste, ela sai do componente e vira
  hook ou use case.
- `GoogleCalendarImporter` / `GoogleSheetsTaskSender` — dependem de `fetch` externo
- Contexts React acoplados ao runtime Tauri (`RunningTaskContext`)

**Convenções:**
- Arquivos espelham o source: `src/tests/domain/usecases/plannedTasks/CreatePlannedTask.test.ts`
- Factory `makeRepo()` reutilizada por arquivo de teste para minimizar boilerplate
- Casos de teste nomeados em português, descrevendo o comportamento esperado
- **Instante de teste nunca é literal UTC** — use `localISO(ano, mês, dia, hora)`
  (`src/tests/helpers/localTime.ts`). Boa parte da lógica de data raciocina em dia
  local (§6.6): o dia da tarefa, o agrupamento por dia, o `calcDailyRange` do envio
  diário e as colunas de data do Monday. `"2026-07-30T12:00:00.000Z"` é dia 30 em
  São Paulo e dia 31 em Auckland, então o literal fazia a asserção depender do fuso
  da máquina — seis testes passavam na CI e falhavam a partir de UTC+12. Fixar o
  `TZ` da suíte resolveria os sintomas e esconderia o defeito: o que se quer dizer
  é "meio-dia do dia 30 **para quem trabalhou**", e é isso que o helper escreve.

---

## 8. CONVENÇÕES DE CÓDIGO

### 8.1 Nomenclatura
- Componentes React: PascalCase (`TaskCard.tsx`).
- Hooks: camelCase com prefixo `use` (`useTaskTimer.ts`).
- Entidades/types: PascalCase (`Task`, `PlannedTask`).
- Variáveis e funções: camelCase.
- Constantes globais: UPPER_SNAKE_CASE.
- Arquivos de teste: `*.test.ts` ou `*.test.tsx`, espelhando o arquivo de origem.

### 8.2 Componentes
- Componentes funcionais com hooks. Sem class components.
- Props tipadas com interface dedicada (`interface TaskCardProps`).
- Modais como componentes isolados em `presentation/modals/`.
- Overlays como componentes isolados em `presentation/overlays/`.
- **Todo modal fecha no ESC**, via `useEscapeToClose(onClose)` — um único hook, nunca um
  `addEventListener` copiado. Um modal que não fecha no ESC é o único da tela que não fecha, e o
  usuário só descobre qual é tentando. O hook ignora o ESC já consumido (`defaultPrevented`), que é
  como o `Autocomplete` fecha o dropdown sem derrubar o modal junto. Exceção: o `SetupModal`, que
  não tem para onde fechar.

> **Enter em qualquer campo submete o formulário**, via `useSubmitOnEnter(onSubmit)` no
> **container** — nunca um `onKeyDown` por campo. `keydown` borbulha, então um handler cobre todos
> os descendentes, inclusive os que ainda não existem; eram 37 handlers avulsos em 27 arquivos, e o
> resultado é que o Enter funcionava em uns campos e não em outros (data, duração, e todos os
> modais de conexão, mover e exportar).
>
> **Quem consome a tecla avisa com `preventDefault`, e o container ignora o que já foi consumido.**
> É assim que a lista aberta seleciona a opção sem submeter junto (`Autocomplete`,
> `DatePickerInput`) — o mesmo sinal que o `useEscapeToClose` usa para o ESC, e pela mesma razão: um
> contrato entre os dois lados evita que o container precise saber quais filhos abrem lista. Só
> **um** Enter fecha a lista; o **segundo**, com ela fechada, submete.
>
> Os containers **não** viram `<form>`, e não é descuido: `<button>` sem `type="button"` dentro de
> um form vira submit, e são ~15 telas cheias de botões de toggle onde essa regressão passaria
> despercebida. O `PlannedTaskForm` é `<form>` por já ser, e ali o hook cancela o submit implícito
> do navegador para a regra continuar sendo uma só.
>
> Três escapes, nesta ordem de preferência: `onEnter` no campo (para o editor de linha que não tem
> submit único — os cinco dentro dos modais de lista), `data-no-submit` no bloco (sub-formulário,
> como a linha "adicionar ação" da planejada) e a opção `disabled` do hook (formulário ainda
> carregando ou inválido). Em `<textarea>` o Enter quebra linha e **Ctrl/Cmd+Enter** submete.
>
> **Enter também confirma as duas exclusões que pedem confirmação** (workspace, §6.7; atividade do
> Monday, §5.7) — decisão explícita do usuário, contra a recomendação registrada aqui. A guarda
> dessas telas continua sendo a escolha obrigatória que elas exigem, não a dificuldade de acionar o
> botão.
>
> **Onde o Enter deliberadamente não submete:** modais que operam sobre uma **seleção** em vez de um
> formulário — importar da Agenda, importar itens do Monday, enviar tarefas. Ali a ação é em lote
> sobre N itens, e dispará-la a partir de um campo que a pessoa ainda está ajustando é o oposto de
> um padrão seguro. O mesmo vale para painéis com duas ações igualmente válidas e nenhuma primária
> (destino da exportação: arquivo ou área de transferência).

> **Todo `<input>` desliga o autofill do navegador** com `autoComplete="off"`. Um teste de
> convenção (`src/tests/conventions/inputAutocomplete.test.ts`) varre os `.tsx` e falha apontando
> arquivo e linha: sem ele o atributo vira verdade só no dia do commit, porque a falha não é erro
> nenhum — é o navegador abrindo uma lista de valores antigos por cima do campo. Ficam de fora os
> tipos sem autofill (caixa, rádio, botão, faixa, arquivo).

### 8.3 Estado
- Estado local com `useState`/`useReducer` para UI.
- Estado global (tarefa em execução, configurações) via Context API ou estado gerenciado (avaliar Zustand se complexidade crescer).
- Dados persistentes via repositórios (Clean Architecture).

### 8.4 Estilização
- Tailwind CSS como padrão. Sem CSS modules ou styled-components.
- Temas implementados via CSS custom properties controladas pela configuração de tema.
- Tamanhos de fonte escalados via variável CSS controlada pela configuração de acessibilidade.

## Fonte da verdade visual

> **Corrigido em 2026-07-30.** Esta seção apontava para seis artefatos de uma migração de design
> system que **não existem no repositório**: `.claude/design-system/` (inteiro), `component-map.md`,
> `token-map.md`, `acceptance.md`, `findings.md` e `MIGRATION_GUIDE.md`. As regras que dependiam
> deles ficavam inexequíveis e travavam agentes na primeira mudança visual. Abaixo está o que
> existe de fato.

- **Tokens de cor:** vêm do **Tailwind v4** (`@import "tailwindcss"` em `src/index.css`), que expõe
  a paleta inteira como CSS custom properties `--color-<slot>-<peso>` (26 slots: `blue`, `rose`,
  `teal`, `violet`, `amber`…). **Não há um `tokens.css` no projeto** — a paleta é a do Tailwind.
- **Overrides de tema:** `src/index.css` remapeia famílias por tema (`[data-theme="verde"]` troca
  `blue` por `green`; `[data-theme="escuro"]` troca `gray` por `zinc`; `[data-theme="claro"]`
  inverte a escala de `gray`). Por isso `blue`, `green`, `gray` e `zinc` são **reservados** e não
  devem ser usados para colorir entidades.
- **Escala tipográfica:** `--app-font-size` em `:root`, controlada pela configuração de
  acessibilidade.
- **Paleta de cores de entidade:** `src/domain/utils/workspaceColor.ts` define a lista curada de
  slots usada para colorir workspaces, junto com a justificativa de cada exclusão.

## Regras obrigatórias

1. **Zero hardcode visual.** Nunca crie cores, tamanhos, raios, sombras ou tipografias com valores
   literais. Use sempre as custom properties do Tailwind (`var(--color-teal-500)`) ou as declaradas
   em `src/index.css`. Se precisar de um valor que não existe na paleta do Tailwind, pare e
   pergunte — não invente um novo.

2. **Um componente por conversa.** Não refatore múltiplas telas/componentes na mesma mudança.
   Escopo pequeno é verificável.

3. **Ambiguidade pausa o trabalho.** Se encontrar conflito entre design e código existente (ex:
   props diferentes, dados diferentes, lógica conflitante), PARE e pergunte. Não adivinhe.

4. **Mudanças fora do escopo são rejeitadas.** Não "melhore" partes do código que não foram
   pedidas, mesmo que pareçam problemas óbvios. Registre a observação no resumo da entrega e
   continue.

## Critérios de "pronto" (universal)

Todo PR visual deve passar em:

- [ ] Zero valores hex/rgb/oklch literais fora de `src/index.css`
- [ ] Zero valores de espaçamento literal (px) fora das escalas do Tailwind
- [ ] Testes existentes passam
- [ ] Sem console warnings novos
- [ ] Comportamento verificado nos quatro temas (Azul, Verde, Escuro, Claro)

## Tom e linguagem

- UI em **português (Brasil)**, sentence case, sem emoji, sem gírias
- Números: tempos em `HH:MM:SS`, durações compactas `1h30` ou `45m`
- Botões: verbo no infinitivo ("Iniciar", "Parar & salvar")
- Mensagens: curtas e informativas, nunca paternalistas

## Quando pedir ajuda humana

Pare e pergunte se:
- A paleta do Tailwind não cobre o que a tela precisa e um token novo parece necessário
- Props antigas conflitam com estrutura nova
- Comportamento interativo ambíguo (ex: hover em mobile?)
- Uma seção desta especificação aponta para um arquivo que não existe no repositório

---

## 9. GUARDRAILS ARQUITETURAIS (obrigatório para qualquer agente de IA)

> Este projeto passou por análise SOLID/DRY completa em 2026-05-05. As regras abaixo existem para impedir que novas contribuições reintroduzam os antipatterns mapeados. **Violar uma regra exige justificativa explícita ao usuário antes do código rodar.**

### 9.1 Antes de tocar código

- [ ] **Rodou `gitnexus_impact` no símbolo a ser modificado.** Reportar blast radius ao usuário antes de editar.
- [ ] **Identificou em qual camada está mexendo** (`domain/`, `infra/`, `presentation/`, `shared/`) e revisou as regras da camada (§3).
- [ ] **Procurou primeiro abstração existente** em `domain/repositories/` ou `domain/integrations/` antes de instanciar classe concreta.

### 9.2 Regras invioláveis por camada

#### `domain/`
- ❌ **Nunca** importar de `infra/` ou `presentation/`.
- ❌ **Nunca** importar `@tauri-apps/*`, `react`, ou qualquer SDK externo.
- ✅ Apenas tipos puros, interfaces (`I*Repository`, `I*Sender`, `I*Importer`, `ISyncStrategy`), entidades e use cases.

#### `infra/`
- ❌ **Nunca** importar de `presentation/`.
- ❌ **Nunca** depender de `ConfigContextValue` diretamente. Se precisa ler config, declare uma porta estreita (ex.: `ISheetsConfigPort`, `IClockifyConfigPort`) em `domain/integrations/` listando só as chaves usadas. A UI implementa a porta via adaptador. Esta regra existe porque hoje 10 arquivos de `infra/` dependem de uma interface com 65 chaves heterogêneas.
- ✅ Toda classe pública implementa uma interface declarada em `domain/`.

#### `presentation/`
- ❌ **Nunca** instanciar classes concretas de `infra/` em componentes/hooks/modais. Se aparecer `new GoogleSheetsTaskSender(...)`, `new ClockifyClient(...)`, `new GoogleCalendarImporter(...)`, `new AutoSyncRunner([new XSyncStrategy(...)])` em código novo de `presentation/`, **pare e injete via Provider/context**.
- ❌ **Nunca** adicionar `new XxxRepository()` ou `new XxxAdapter()` no nível de módulo. Composition root vai num Provider com prop `value?` injetável.
- ❌ **Nunca** usar `await import("@infra/...")` dinâmico para "esconder" dependência. Se está fazendo isso, é sinal de que falta abstração.
- ❌ **Nunca** suprimir `react-hooks/exhaustive-deps` sem comentário explicando por quê. Hoje há 30+ supressões — não adicione mais.
- ❌ **Nunca** criar, renomear ou excluir Project/Category direto pelo repositório sem chamar `notifyProjectsChanged()` / `notifyCategoriesChanged()` (`shared/utils/catalogSync.ts`). Cada janela tem seu próprio `useProjects`/`useCategories`, e o `overlay-popup` nasce com o app e **nunca remonta**: sem o aviso, ele fica para sempre com o catálogo do momento em que o app abriu, e toda tarefa que aponte para um projeto novo aparece lá sem projeto nem categoria. As mutações dos próprios hooks já avisam — a regra vale para os importadores de integração, que gravam pelo repositório. (O `SetupModal` também gravava, até deixar de cadastrar catálogo; ver §5.9.)

#### `shared/`
- ✅ Apenas utils puros, tipos, constantes. Sem side-effects, sem I/O, sem estado.
- ❌ Não use como "lugar onde colocar quando não sei onde vai" — se é regra de negócio, é `domain/`.

### 9.3 Limites de tamanho (orientações, não regras absolutas)

| Tipo | Verde | Amarelo (revisar) | Vermelho (split obrigatório) |
|---|---|---|---|
| Componente React | < 200 linhas | 200–350 | > 350 |
| Hook customizado | < 80 linhas | 80–150 | > 150 |
| Use case | < 50 linhas | 50–100 | > 100 |
| `useEffect` por componente | ≤ 4 | 5–8 | > 8 (hooks focados) |
| `useState` por componente | ≤ 8 | 9–15 | > 15 (extrair `useReducer` ou hook próprio) |

Quando atingir vermelho: **não adicionar mais features ao símbolo. Refatorar primeiro, feature depois.**

### 9.4 Antes de duplicar lógica — checagem obrigatória

Se você está prestes a:

- **Copiar lógica de uma SyncStrategy** → use `BaseSyncStrategy`/template existente (a ser introduzido pelo item 2 do refactor).
- **Copiar UI de seleção de tarefas (toggleGroup, toggleDay, selKey, hasSentSelected)** → use `<TaskSendModal>`/`useTaskSendSelection` (item 1 do refactor).
- **Copiar UI de auto-sync (Modo / Gatilho / Horário / Último envio)** → use `<AutoSyncControls integrationKey="...">`.
- **Copiar lógica de import de catálogo (fetch → find/create → mapping → persist)** → use helper `runIntegrationImport(...)`.

Se a abstração ainda não existe (porque o item de refactor está pending), **pare e pergunte** se vale criá-la agora vs esperar o refactor agendado.

### 9.5 Adicionando uma nova integração externa (Toggl, Jira, Linear…)

Roteiro obrigatório:
1. Criar interface em `domain/integrations/` (ex.: `ITogglApi`, `ITogglConfigPort`).
2. Implementar adaptador em `infra/integrations/toggl/` que `implements` a interface.
3. Se sincroniza tarefas: criar `TogglSyncStrategy implements ISyncStrategy`.
4. Registrar a strategy no Provider central de auto-sync (não em `App.tsx` nem em `usePostStopLogic` — esses dois lugares hoje têm cópias hardcoded; novo trabalho deve usar o ponto único).
5. UI consome via hook injetado, **nunca** `new TogglClient()` direto em componente.
6. Adicionar testes em `tests/infra/integrations/toggl/` espelhando a estrutura dos existentes.
7. **Escopar as leituras pelo workspace da integração.** Declare a chave
   `<integração>DeskclockWorkspaceId` no `AppConfig`, resolva-a com
   `resolveIntegrationWorkspaceId` (vazio = workspace "Padrão") e passe o resultado a
   `findAll(ws)` / `findByDateRange(start, end, ws)`. No modo por tarefa, a de outro workspace é
   pulada **sem `warning`**. A integração lê a **própria** config — não recebe workspace por
   parâmetro nem do `WorkspaceContext` (§6.7).

   > **Esta regra dizia o contrário até 2026-08-06** ("integrações são externas ao workspace e
   > enxergam tudo"), e a inversão é o ponto. Sem escopo, o board do cliente recebia as horas do
   > trabalho pessoal e o import nascia em qualquer workspace que estivesse aberto na hora do
   > ciclo. Quem encontrar código escopado e a regra antiga na memória: a regra antiga foi
   > revogada, não esquecida.

### 9.6 Adicionando configuração ao usuário

- ✅ Ao adicionar uma chave em `AppConfig`, considere se cabe numa porta estreita já existente. Se a chave só interessa a uma integração, **declare a porta** em `domain/integrations/` e atualize só os consumidores reais.
- ❌ Não acoplar `ConfigContextValue` ao infra. Se precisa de uma chave dela em `infra/`, passe-a como argumento ou via porta — não receba `ConfigContextValue` inteiro.

### 9.7 Quando o refactor SOLID está em curso

Há um tracker de 10 itens em memória (`project_solid_analysis_2026_05.md`). Antes de tocar um símbolo listado lá, **verificar se o item está em andamento** — pode haver branch ativa. Se sim, coordenar com o usuário em vez de criar conflito.

---

*Última atualização: 2026-08-07 (§5.3 e §5.8: as colunas de formulário do Planejamento e do Lançamento Manual passam a ser arrastáveis, e a lista de planejadas do Lançamento Manual redimensiona na vertical, com `useResizablePanel` + `ResizeHandle` como base genérica — geometria numa prop só (`anchor`) e o handle lendo o eixo do próprio `aria-orientation`; §5.7: o `ITaskSender` devolve `TaskSendOutcome` — envio parcial deixa de ser marcado como tudo ou nada, recusa de um grupo não aborta os seguintes e a tela ganha o tom de envio parcial; §5.9: o onboarding deixou de cadastrar projetos e categorias e passou a sugerir conectar uma integração, abrindo o app na tela de Integrações; §6.4: a lista do autocomplete se dimensiona pelo conteúdo, com o teto medido contra a borda da janela; §5.7: arredondamento de duração documentado, e a duração gravada passa a mandar sobre o intervalo início→fim na edição de tarefa — vale também para tarefa pausada; §8.2 e §6.4: Enter em qualquer campo submete o formulário, via `useSubmitOnEnter` no container, com `preventDefault` como o aviso de "já consumi esta tecla" que faz a lista aberta selecionar sem submeter junto; §8.2: todo `<input>` com `autoComplete="off"`, guardado por teste de convenção; §5.7: o alerta de reunião leva também os campos personalizados da planejada, entre eles o Project Stage; §5.7: o vínculo da reunião com a planejada só vale dentro do workspace em que a tarefa nasce, com casamento por nome no ativo como rede — era o que fazia o alerta iniciar sem projeto nem categoria; §4.1 e §5.1.2: configurar a tarefa depois de iniciada configura também a planejada de origem; §5.7: schema de board cacheado por 7 dias na varredura do Monday, com "Atualizar" ignorando a validade e só sucesso estampando a marca; §5.7: catálogo de projetos lido numa consulta só na varredura do Monday, com o nome comparado aparado; §5.7: piso de data na busca do gerenciador de atividades do Monday, e causa técnica do erro no tooltip do ícone; §5.7: otimização da API do Monday — lotes de board em paralelo com teto, e nova tentativa nas recusas temporárias, com a `mutation` fora do 5xx e da falha de rede para não duplicar atividade; §5.7: otimização da API do Monday — schemas dos boards lidos em lote na varredura de projetos (~46 requisições sequenciais → 3, e falha de token deixa de zerar o mapeamento) e coluna de cronograma cacheada em `timelineColumnId`, que tira a leitura de schema do ciclo de importação; §5.7: importação automática de itens passa de 30 min para 4 h, com o "Buscar itens agora" como caminho pontual; §5.6, §6.4 e §5.7: categorias por projeto — o autocomplete de categoria oferece só as associadas, conjunto vazio devolve o catálogo inteiro, a associação se edita na linha do projeto na tela de Dados e o import do Monday a semeia pelos Activity Types do board; §6.7: o modal de exclusão de workspace avisa quais integrações param junto, incluindo as que usam o "Padrão" sem tê-lo escolhido; §5.7, §6.7 e §9.5: cada integração trabalha num workspace do DeskClock escolhido nela mesma — **o item 7 do §9.5 passou a dizer o contrário do que dizia**, e o rastreio automático de reuniões é a exceção deliberada; §5.7: Report Type adormecido — toda atividade vai como `Activity`, com o roteamento por grupo pronto em volta; §5.7: Report Type vira o grupo de destino da atividade, motivo de não faturável obrigatório em cliente e recusa que não aborta o envio; §7.6: instante de teste nunca é literal UTC — `localISO`; §5.7: as datas da atividade do Monday vão só com o dia, sem hora; §5.1.2: campos personalizados antes do agendamento na edição de planejada pelo popup; §5.7: uma leitura do board de Report semeia os quatro catálogos de rótulos, `dropdown` tem formato próprio, e os três campos de atividade são campos personalizados irmãos, sem default de motivo por categoria; §5.7: a configuração do Monday são dois ids de board — Portfólio e Report de Horas — no lugar de workspace, duas pastas, board interno e mapeamento manual; §5.7: um item do Portfólio é um Project, classificado pela coluna Oferta, e item sem "ID Quadro Projeto" vira projeto sem destino em vez de ser recusado; §5.7: board ilegível deixa de custar o Project; §5.7: lista de projetos do Monday se relê sozinha uma vez por dia; §5.7: excluir atividade do Monday pede confirmação e a linha sai da lista na hora; §5.7: Start Date e End Date da atividade do Monday vêm do intervalo trabalhado, não do envio; §4.1: reexecutar uma entrada leva a origem junto, a parada cai no vínculo da própria tarefa, e campo ausente no evento entre janelas deixou de zerar o vínculo; §4.1: origem da execução persistida na tarefa, restaurada ao reabrir o app; §5.7: reunião iniciada à mão é reconhecida em vez de re-perguntada; §5.7: rastrear e planejar reunião são etapas separadas, com vínculo explícito da planejada, auto-cura e erro registrado; §5.7: reunião adota a planejada do Monday de mesmo nome em vez de duplicar; §5.7: rastreadores esperam o workspace resolver; §5.7: item na lixeira do Monday é detectado pelo `state` e recriado; §5.7: envio manual ao Monday escreve sempre e o aviso de reenvio não impede; §5.7: gerenciador de atividades do Monday com uma busca só e sem filtro personalizado; §5.7: "Sincronizar agora" no Monday; §5.7: rail de integrações também na tela de Integrações; §5.3 e §5.8: colunas de formulário recolhíveis; §5.3: "Selecionar tarefas" na linha dos dias; §5.7: Monday no rail de integrações só configurado ponta a ponta; §5.7: o modal de importação do Monday esconde item que já tem planejada viva; §5.1.2: edição de planejada dentro do popup, no tamanho atual; §9.2: aviso obrigatório de mudança no catálogo de projetos e categorias entre janelas)*

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **deskclock-tauri** (6295 symbols, 15089 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/deskclock-tauri/context` | Codebase overview, check index freshness |
| `gitnexus://repo/deskclock-tauri/clusters` | All functional areas |
| `gitnexus://repo/deskclock-tauri/processes` | All execution flows |
| `gitnexus://repo/deskclock-tauri/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
