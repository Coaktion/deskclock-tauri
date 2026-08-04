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
| created_at | datetime | Auto |
| updated_at | datetime | Auto |

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
- **Editar planejada sem sair do overlay (`PlannedTaskEditSheet`):** painel que cobre o conteúdo do popup **no tamanho que ele já tem** — a janela não cresce, porque crescer tiraria o overlay do canto onde o usuário o deixou. Traz os mesmos campos do `EditPlannedTaskModal`: nome, projeto, categoria, billable, agendamento, campos personalizados e ações. O que garante que os dois não divirjam é o `usePlannedTaskEditor`, que guarda todo o estado e a montagem do payload; os componentes só dispõem os campos na tela (§9.4). Adaptações para os 264 px úteis: tudo empilhado em coluna, dias da recorrência com uma letra (o dia inteiro fica no `title`), período com as duas datas empilhadas, e o corpo rolando por dentro — é a rolagem que absorve campos personalizados e ações sem mexer na janela. Com o painel aberto, o popup **não fecha no blur nem no ESC** (o ESC fecha o painel) — fechar sozinho descartaria a edição, a mesma guarda já usada pelo prompt de reunião.
- **Estado running/paused:** nome da tarefa, timer ao vivo, borda lateral colorida (billable/non-billable). Controles: Play/Pause, Stop (com confirmação Concluída/Pendente), Cancelar, Fechar.
- **Confirmação de Stop:** ao clicar em Parar, abre um painel inline com input `HH:MM` da hora de término (preenchido com a hora atual) e botões `Concluída` / `Pendente`. Se o usuário não tocar no campo, o término é gravado como agora. Se backdatear, a hora informada vira o `endTime` e a `durationSeconds` é recalculada — atendendo ao caso "esqueci de parar o timer". Validação inline rejeita horas anteriores ao `startTime`.
- **Edição inline por campo:** clique em nome, projeto ou categoria abre edição in-place sem modal.
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

- **Header:** Intervalo da semana (ex: "06/04 — 12/04/2026") + navegação ← → + contador de concluídas.
- **Layout em duas colunas:** formulário fixo à esquerda (`PlannedTaskForm`), semana à direita — o mesmo arranjo do Lançamento Manual (§5.8). As duas telas de entrada compartilham o vocabulário visual dos campos em `presentation/components/fieldStyles.ts`; **não duplicar essas classes**, ou um ajuste numa tela desalinha a outra em silêncio.
- **A coluna do formulário recolhe** (`CollapsibleFormColumn`, o mesmo componente do Lançamento Manual): sobra uma faixa de 36 px com o rótulo de pé, e a lista fica com a tela inteira. O estado é **persistido** por tela (`planningFormCollapsed`, `retroactiveFormCollapsed`) — quem recolheu quer espaço para trabalhar, e reabrir a cada navegação desfaria o pedido. Não há toggle em Configurações: o controle é o próprio botão da coluna. O `data-tour` vive na casca, não no formulário, para o tour ter alvo mesmo com a coluna recolhida.
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
- **Importar Google Agenda:** Botão visível quando Google conectado. Modal com eventos agrupados por dia (accordion), seleção por dia, editor inline por evento (projeto, categoria, recorrência). Filtra `workingLocation` e `outOfOffice`. `focusTime` **não** é filtrado — blocos de foco viram tarefas, pois costumam representar trabalho real.

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
| Mostrar rail de integrações | toggle | Faixa à direita com atalhos das integrações conectadas (padrão: ativo). Aparece em **todas** as telas, inclusive na de Integrações — a redundância com os tiles dali não incomodou na prática, e o rail sumindo numa tela só fazia a faixa parecer instável |

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
| Rastrear reuniões automaticamente | toggle (`calendarAutoTrackingEnabled`, padrão desativado; requer Google conectado) |

> **Rastreamento automático de reuniões:** quando ligado, `useMeetingTracker` (na main window, dentro do `RunningTaskProvider`) busca os eventos com horário do dia ao abrir o app e a cada 30 min, rastreando-os num store próprio da integração (`calendar_tracked_meetings` — a identidade do evento fica confinada aqui; `Task`/`PlannedTask` permanecem agnósticas). No horário de início (até 1 min antes) emite um prompt reutilizando a janela `overlay-popup`; confirmar inicia a tarefa via `RunningTaskContext.switchToTask` (encerra a corrente e inicia a da reunião). No término, pergunta se ainda está em andamento e re-pergunta a cada 15 min até encerrar — nunca para sozinho. A decisão de quando exibir cada prompt vive em use cases puros (`computeMeetingPromptActions`, `syncTodayMeetings`).

**Clockify:**
| Campo | Tipo |
|---|---|
| API Key | input password + instrução inline |
| Workspace ativo | dropdown (buscado via API) |
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
| Workspace ativo | dropdown (buscado via API, com catálogo cacheado na config) |
| Importação de dados | workspace de destino + três blocos: Projetos, Categorias e Project Stage |
| Sincronização automática | toggle + modo (por tarefa / diário) + gatilho (ao abrir / horário fixo) + "Sincronizar agora" no modo diário |
| Importação automática de itens | toggle (`mondayAutoImportEnabled`, padrão desativado) + botão "Buscar itens agora" |
| Enviar tarefas manualmente | botão abre o `TaskSendModal` genérico |
| Importar itens como planejadas | botão abre o `MondayImportModal` |
| Gerenciar atividades | botão abre o `MondayEntriesModal` |

> **No rail de integrações o Monday só aparece configurado ponta a ponta** (`isMondayReady`): chave
> de API, ao menos um board mapeado **no workspace ativo do Monday**, board interno e campo de
> Project Stage. Diferente do Clockify e do Google, a chave sozinha não torna a integração
> utilizável — sem board não há o que consultar, e sem a etapa o Monday recusa a escrita das horas.
> O atalho existe para quem já usa a integração; oferecê-lo pela metade seria três ações que abrem
> vazias. A tela de Integrações continua acessível sempre, que é onde a configuração se completa.

> **"Sincronizar agora" dispara só o Monday** (`AutoSyncRunner.runDailyFor`). O `runDaily` do
> runner roda todas as integrações com o modo diário ligado — o botão de um card mandaria tarefas
> para as outras sem ninguém pedir. O botão vive no `AutoSyncControls` compartilhado, atrás da prop
> opcional `syncNow`, e o modo diário é a condição para ele aparecer, como no Google Sheets: no modo
> por tarefa o envio já acontece ao concluir.

> **Workspace e pastas nascem pré-escolhidos** (`mondayDefaults`): workspace `Delivery Center`,
> pasta de clientes `Projetos` e pasta de projetos internos `Projetos Internos`. São **sugestões de
> primeira escolha**, aplicadas só quando o id aparece no que a API devolveu — conta que não os
> tenha cai no comportamento anterior (primeiro workspace, nenhuma pasta), e os três selects
> continuam trocáveis. Sem lista devolvida pela API não há o que pré-selecionar, e a seção segue
> mostrando o texto de "nenhuma pasta visível" — não há de onde puxar id nenhum.
>
> Os padrões entram **na conexão** e **na troca de workspace**, os dois momentos em que se sabe que
> nada foi escolhido. Depois deles, pasta vazia é uma escolha ("Todas as pastas" / "Nenhuma"), e
> reaplicar o padrão desfaria o que o usuário decidiu. Por isso a conexão também grava o cache de
> pastas **e** o de boards: a seção só busca o catálogo quando não há cache, e gravar um sem o outro
> deixaria o board interno sem lista até alguém apertar atualizar.

> **Um board é um Project.** A pasta de clientes vira um Project por board; da pasta interna, só o
> board único escolhido pelo usuário. **Não há tabela de mapeamento** de categoria nem de etapa: o
> Activity Type é o **nome** da Categoria e o Project Stage é o campo personalizado apontado por
> `mondayProjectStageFieldId` — a tarefa grava o **id da opção**, e o sender traduz para o rótulo.
> Rótulo que não existe na coluna do board **não vai no payload**: o Monday recusaria a escrita
> inteira, derrubando um envio correto por causa de uma categoria não relacionada.

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
> cada 30 min, faz sozinho o que o modal faz à mão — a mesma busca, os mesmos padrões
> (`buildImportRows`/`resolveItemDefaults`, compartilhados com o modal, §9.4) — para a **semana
> corrente**. Sem prompt: é o rastreamento de agendas do Google levado ao Monday, e não há nada a
> perguntar.
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
> Activities, **apenas os do usuário conectado** — os boards são compartilhados e exclusão aqui é
> sem confirmação (§1). Todos os boards vão numa **consulta só** (`listItems(boardIds)`, em lotes de
> 20): uma requisição por board mapeado dispara dezenas de chamadas paralelas para descobrir que
> quase todas voltam vazias. O filtro de janela é por **sobreposição** do intervalo Start Date → End
> Date, não por data de início: uma atividade de 01/07 a 28/07 pertence a todo dia do meio — e fica
> no cliente, porque as regras do Monday não expressam "intervalo que cruza o período" e o intervalo
> mora em duas colunas separadas. Editáveis: nome, horas, billable, Activity Type e Project Stage —
> as datas não, porque marcam o envio. **Excluir também apaga a linha de `monday_activity_items`**;
> sem isso o envio seguinte encontra rastreamento órfão e repete `MondayNotFoundError` a cada
> execução.

#### Feedback
- Botão na **sidebar** (não dentro das configurações) que abre URL externa no navegador padrão para envio de feedbacks, bugs, sugestões.
- Implementado via `tauri-plugin-opener` (`openUrl`).
- Posição: rodapé da sidebar, ícone `MessageSquare` (Lucide).

---

### 5.8 Tela de Lançamento Retroativo

> **Decisão de produto:** O lançamento retroativo era originalmente especificado como um modal na Tela de Tarefas. Foi convertido em tela dedicada acessível pela sidebar para permitir entrada rápida em sequência de múltiplas tarefas sem fechar e reabrir o fluxo.

- **Acesso:** Ícone `FileClock` na sidebar.
- **Navegação de data:** Setas ← → e DatePickerInput. Não é possível avançar além de hoje.
- **Layout em duas colunas:** formulário fixo à esquerda (`RetroactiveEntryForm`, coluna estreita e rolável), lista do dia à direita. Empilhados, os campos personalizados faziam o formulário crescer sem limite e empurravam os apontamentos para fora da tela. A coluna **recolhe** como a do Planejamento (§5.3) — e **reabre sozinha** quando algo pré-preenche o formulário (deeplink de lançamento, botão de uma planejada sem horário): preencher campo escondido não mostraria nada.
- **Formulário de criação inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, Hora início, Hora fim, Duração e os campos personalizados ativos. Criação sem modal; edição de registros existentes abre `EditTaskModal`.
- **Rótulo flutuante nos campos personalizados:** o rótulo começa dentro do campo, como placeholder, e sobe para a borda ao focar ou quando há valor — parando na mesma posição do rótulo encaixado de Início/Fim/Duração. Vale só para os campos personalizados, porque são os únicos dinâmicos: "Project Stage" não se explica pela posição no formulário como Nome e Projeto se explicam, então precisa continuar legível depois de preenchido. Os dois modos anteriores (`labelsAsPlaceholder` e rótulo-acima) foram removidos: o flutuante serve à coluna estreita e ao modal. O checkbox é a exceção — não há onde flutuar, o rótulo fica ao lado da caixa.
- **Modo de duração:** Toggle "Hora fim" / "Duração". Na duração, aceita `HH:MM:SS`, `MM:SS` ou inteiro (minutos).
- **Overnight:** Se hora fim < hora início, considera-se que a tarefa cruzou meia-noite — end é atribuído ao dia seguinte.
- **Cadeia de horários:** Após adicionar uma tarefa, o campo "Início" da próxima é automaticamente preenchido com o fim da tarefa recém-criada.
- **Tecla Enter:** Cria a tarefa (exceto quando autocomplete está aberto — nesse caso, seleciona o item).
- **Lista de tarefas do dia:** Tarefas completadas do dia selecionado, ordenadas da mais recente para a mais antiga.
  - Botões por linha: Editar (abre `EditTaskModal`) | Excluir (sem confirmação).
- **Total do dia:** Exibido no header quando há tarefas.

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
- Enter com dropdown fechado (ou sem resultados): dispara `onEnter` (geralmente cria/salva o item do formulário pai).
- Dropdown fecha ao perder foco (`onBlur`).
- Permite texto livre se nenhum resultado — não cria projeto/categoria automaticamente.

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
- `findAll(workspaceId?)` e afins tratam `undefined` como "todos os workspaces". Esse é o caminho das **integrações**, que são externas ao workspace e enxergam tudo. `useTaskSendSelection` depende disso de propósito.
- `findByName(name, workspaceId)` exige o parâmetro: a unicidade de projeto e categoria é por workspace.
- **Trocar de workspace com tarefa em execução é bloqueado** — a UI oferece "parar e trocar" reusando a pergunta Concluída/Pendente. A guarda vive em `useWorkspaceSwitchGuard`, não em `switchTo`, porque o `RunningTaskContext` já consome o `WorkspaceContext` e o caminho inverso fecharia um ciclo.
- Cada janela tem seu próprio `WorkspaceProvider`; o evento `WORKSPACE_CHANGED` mantém todas em sincronia.
- **Exclusão de workspace exige confirmação**, contrariando o §1. É a única exceção, e é deliberada.

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
- ❌ **Nunca** criar, renomear ou excluir Project/Category direto pelo repositório sem chamar `notifyProjectsChanged()` / `notifyCategoriesChanged()` (`shared/utils/catalogSync.ts`). Cada janela tem seu próprio `useProjects`/`useCategories`, e o `overlay-popup` nasce com o app e **nunca remonta**: sem o aviso, ele fica para sempre com o catálogo do momento em que o app abriu, e toda tarefa que aponte para um projeto novo aparece lá sem projeto nem categoria. As mutações dos próprios hooks já avisam — a regra vale para importadores de integração e para o `SetupModal`, que gravam pelo repositório.

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
7. **Não escopar as leituras por workspace.** Integrações são externas ao workspace e enxergam
   tudo — chame `findAll()` / `findByDateRange(start, end)` sem o terceiro argumento. Se precisar
   criar Projects a partir de um catálogo externo, aí sim o workspace de destino é obrigatório, e
   ele vem do seletor da UI (ver `deskclockWorkspaceId` em `importMondayProjects`).

### 9.6 Adicionando configuração ao usuário

- ✅ Ao adicionar uma chave em `AppConfig`, considere se cabe numa porta estreita já existente. Se a chave só interessa a uma integração, **declare a porta** em `domain/integrations/` e atualize só os consumidores reais.
- ❌ Não acoplar `ConfigContextValue` ao infra. Se precisa de uma chave dela em `infra/`, passe-a como argumento ou via porta — não receba `ConfigContextValue` inteiro.

### 9.7 Quando o refactor SOLID está em curso

Há um tracker de 10 itens em memória (`project_solid_analysis_2026_05.md`). Antes de tocar um símbolo listado lá, **verificar se o item está em andamento** — pode haver branch ativa. Se sim, coordenar com o usuário em vez de criar conflito.

---

*Última atualização: 2026-08-04 (§5.7: workspace e pastas do Monday pré-escolhidos na conexão; §5.3 e §5.8: colunas de formulário recolhíveis; §5.3: "Selecionar tarefas" na linha dos dias; §5.7: Monday no rail de integrações só configurado ponta a ponta; §5.7: o modal de importação do Monday esconde item que já tem planejada viva; §5.1.2: edição de planejada dentro do popup, no tamanho atual; §9.2: aviso obrigatório de mudança no catálogo de projetos e categorias entre janelas)*

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **deskclock-tauri** (5485 symbols, 13070 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
