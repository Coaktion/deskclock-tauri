# CLAUDE.md — Especificação do Projeto DeskClock

> **Propósito deste documento:** Servir como fonte única de verdade para agentes de IA durante todo o ciclo de desenvolvimento. Toda decisão de implementação, arquitetura e design deve ser validada contra este documento. Atualize-o sempre que padrões ou decisões mudarem.

---

## 1. VISÃO GERAL DO PROJETO

**Nome:** DeskClock  
**Tipo:** Aplicativo desktop multiplataforma  
**Objetivo:** Registro de horas trabalhadas com flexibilidade total — o app se adapta ao modo de trabalho do usuário, não o contrário.

**Princípios de design:**
- Cadastros devem exigir o mínimo de cliques possível.
- Edições sempre em modais (exceto planejamento e lançamento retroativo, que são inline).
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
│   ├── entities/     # Task, Project, Category, ExportProfile, Config
│   ├── repositories/ # Interfaces (ports)
│   └── usecases/     # Lógica de negócio pura
├── infra/            # Implementações concretas
│   ├── database/     # SQLite repositories
│   ├── integrations/ # Google Sheets, Google Calendar
│   └── system/       # Atalhos globais, tray, overlay window management
├── presentation/     # React UI
│   ├── pages/        # Tasks, Planning, History, Retroactive, Data, Settings
│   ├── components/   # Componentes reutilizáveis (Autocomplete, DatePickerInput…)
│   ├── overlays/     # WelcomeOverlay, PlanningOverlay, CompactOverlay, ExecutionOverlay
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
| name | string | Único, obrigatório |

### 4.4 Category

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| name | string | Único, obrigatório |
| default_billable | boolean | Padrão para novas tarefas com esta categoria |

### 4.5 ExportProfile

| Campo | Tipo | Regras |
|---|---|---|
| id | UUID | PK |
| name | string | Obrigatório |
| is_default | boolean | Apenas um pode ser default |
| format | enum | `csv` \| `xlsx` \| `json` |
| separator | enum | `comma` \| `semicolon` (apenas CSV) |
| duration_format | enum | `hh:mm:ss` \| `decimal` \| `minutes` |
| date_format | enum | `iso` \| `dd/mm/yyyy` |
| columns | JSON | Array de `{ field, label, visible, order }` |

### 4.6 Config (chave-valor)

| Campo | Tipo |
|---|---|
| key | string (PK) |
| value | JSON |

---

## 5. TELAS E FUNCIONALIDADES

### 5.1 Overlays (Janelas flutuantes)

> **Comportamento geral:** Todos os overlays (exceto Welcome) são arrastáveis com persistência de posição no Config. Usar Tauri window API para janelas separadas.

#### 5.1.1 Welcome Overlay
- **Quando aparece:** Ao abrir o app, se habilitado nas configurações.
- **Conteúdo:** "Bom dia/tarde/noite, {nome}!" (saudação baseada na hora atual: 6-12=dia, 12-18=tarde, 18-6=noite). Nome obtido do campo "Como quer ser chamado?" nas configurações.
- **Subtítulo:** "No que iremos trabalhar hoje?"
- **Botões:** `Planejamento` → abre tela de planejamento. `Nova tarefa` → inicia tarefa imediatamente.
- **NÃO é arrastável.** Desaparece ao escolher uma ação.

#### 5.1.2 Planning Overlay (Expandido)
- **Quando aparece:** Quando não há tarefa em execução E overlay está habilitado.
- **Conteúdo:** Lista de tarefas planejadas para hoje (nome + projeto + botão play).
- **Botão "Nova tarefa":** Inicia tarefa não planejada → abre Execution Overlay, fecha este overlay.
- **Title bar:** 3 botões — `Ir para planejamento` (navega à tela) / `Minimizar` (mostra Compact Overlay) / `Fechar`.
- **Play em tarefa:** Inicia execução → abre Execution Overlay, fecha este overlay. Executa ações configuradas na tarefa (abrir URLs/arquivos).

#### 5.1.3 Compact Overlay
- **Quando aparece:** Ao minimizar o Planning Overlay.
- **Conteúdo:** Ícone do app + badge com contador de tarefas planejadas pendentes (canto superior direito).
- **Clique:** Se há tarefas planejadas → expande Planning Overlay. Se não há → inicia nova tarefa → abre Execution Overlay.
- **Arrastável** com área de arraste dedicada.

#### 5.1.4 Execution Overlay
- **Quando aparece:** Ao iniciar qualquer tarefa.
- **Conteúdo:** Nome da tarefa (ou "(sem nome)"), timer ativo abaixo do nome, borda lateral esquerda colorida (billable/non-billable).
- **Botões:** Play/Pause, Stop, Fechar.
- **Arrastável** por todos os monitores.
- **Ao parar (stop):** Se overlay "Sempre visível" estiver ativo → mostra Planning Overlay. Senão → fecha.

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
- Play inicia execução com dados da tarefa planejada preenchidos. Executa ações configuradas.

> **Nota:** O lançamento retroativo foi movido para uma tela dedicada na sidebar (ver 5.8). A ideia de "botão que abre modal" foi descartada — a tela dedicada permite entrada em sequência de múltiplas tarefas com muito mais agilidade.

#### Seção 3 — Totalizadores
- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").

#### Seção 4 — Entradas de hoje
- **Header:** Título "Entradas de Hoje" + botão "Modo de envio" + total de horas hoje.
- **Lista de tarefas registradas hoje:**
  - Card exibe: Nome, Projeto, Categoria, indicador billable (clicável para alternar), duração.
  - **Botões por card:** Play (inicia nova tarefa com mesmos dados) | Edit (modal completo) | Delete (sem confirmação).
- **Agrupamento:** Tarefas com mesmo Nome + Projeto + Categoria são agrupadas visualmente.
  - Grupo exibe duração total.
  - Botão "Unificar" no grupo → mescla em registro único somando durações, sem confirmação.
  - Edit no grupo → altera todas as tarefas do grupo.
  - Expandir grupo → editar/excluir tarefa individual.

#### Modo de envio
- Ativado por botão no header de "Entradas de Hoje".
- Cada tarefa ganha checkbox de seleção.
- **Botões:** Selecionar todas | Desmarcar todas | Enviar selecionadas | Cancelar modo.
- Enviar → usa integração configurada (Google Sheets ou outra futura).

---

### 5.3 Tela de Planejamento

> **Decisão de produto:** A visão "Hoje" foi removida. A visão Semana já permite selecionar qualquer data (incluindo hoje) e é suficiente para todos os fluxos de planejamento.

- **Header:** Intervalo da semana (ex: "06/04 — 12/04/2026") + navegação ← →.
- **Botões rápidos de dia:** Todos | Dom | Seg | Ter | Qua | Qui | Sex | Sáb. Ao clicar em um dia, filtra a lista e preenche o campo Data do formulário automaticamente.
- **Formulário inline:** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, campo Data.
- **Atalho "Hoje":** No campo Data única, botão de atalho seleciona a data atual.
- **Tipos de agendamento:**
  - `specific_date`: Dia único. Campo data com botão atalho "Hoje".
  - `recurring`: Seleção de dias da semana. Sem data de término. Aparece até ser excluída.
  - `period`: Data início + Data fim. Aparece durante todo o período.
- **Ações por tarefa:** Array de `{ type: "open_url" | "open_file", value: string }`. URL auto-completa `https://` se ausente. N ações por tarefa.
- **Tecla Enter:** Se autocomplete fechado → cria a tarefa. Se autocomplete aberto → seleciona item.
- **Edição:** Inline. Salva ao perder foco se houve alteração.
- **Botões por tarefa:** Play | Concluir/Pendente | Duplicar | Ações (expandir/editar ações) | Excluir (sem confirmação).
- **Importar Google Agenda:** Botão visível quando Google conectado. Modal com eventos agrupados por dia (accordion), seleção por dia, editor inline por evento (projeto, categoria, recorrência). Filtra `workingLocation`, `outOfOffice` e `focusTime`.

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
- **Formato:** CSV | XLSX | JSON.
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

---

### 5.7 Tela de Configurações

#### Geral
| Configuração | Tipo | Descrição |
|---|---|---|
| Iniciar na inicialização do computador | toggle | Registra o app no startup do SO |
| Timer ao vivo no ícone da bandeja | toggle | Mostra timer no system tray icon |
| Abrir acesso rápido ao iniciar | toggle | Exibe o Command Palette ao abrir o app (padrão: ativo). Use Ctrl+K para abrí-lo a qualquer momento. |
| Fechar ao perder foco | toggle | Janela principal fecha ao perder o foco (padrão: desativado); Pin/Unpin na title bar suspende temporariamente |
| Descartar tarefas com menos de 1 minuto | toggle | Cancela automaticamente tarefas paradas em menos de 60 s (padrão: desativado) |

#### Overlay
| Configuração | Tipo | Descrição |
|---|---|---|
| Sempre visível | toggle | Overlay permanece visível após concluir tarefa, mostrando tarefas planejadas |
| Mostrar ao iniciar tarefa | toggle | Execution Overlay aparece ao iniciar tarefa |
| Opacidade em repouso | slider (%) | Opacidade do overlay quando não está em interação |
| Snap to grid | toggle | Encaixa overlay em grade ao soltar arraste |
| Mostrar indicador visual da grade | toggle | Exibe grid visual ao arrastar overlay |

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
| Autorização | botão OAuth |

**Google Agenda:**
| Campo | Tipo |
|---|---|
| Autorização | botão OAuth |

#### Feedback
- Botão na **sidebar** (não dentro das configurações) que abre URL externa no navegador padrão para envio de feedbacks, bugs, sugestões.
- Implementado via `tauri-plugin-opener` (`openUrl`).
- Posição: rodapé da sidebar, ícone `MessageSquare` (Lucide).

---

### 5.8 Tela de Lançamento Retroativo

> **Decisão de produto:** O lançamento retroativo era originalmente especificado como um modal na Tela de Tarefas. Foi convertido em tela dedicada acessível pela sidebar para permitir entrada rápida em sequência de múltiplas tarefas sem fechar e reabrir o fluxo.

- **Acesso:** Ícone `FileClock` na sidebar.
- **Navegação de data:** Setas ← → e DatePickerInput. Não é possível avançar além de hoje.
- **Formulário inline (sem modal):** Nome, Projeto (autocomplete), Categoria (autocomplete), Billable, Hora início, Hora fim OU Duração.
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
- Iniciar nova tarefa para automaticamente a tarefa atual (registra end_time e calcula duração).
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
- Ao iniciar uma tarefa planejada via Play, todas as ações configuradas são executadas em sequência.
- `open_url`: Abre URL no navegador padrão. Auto-prepend `https://` se não contiver `http://` ou `https://`.
- `open_file`: Abre arquivo/pasta no explorador de arquivos do SO.

### 6.6 Data de referência da tarefa
- A data de uma tarefa é sempre a **data local do `startTime`** (menor horário).
- Tarefas que cruzam meia-noite (início em um dia, fim no seguinte) pertencem ao dia de início.
- Toda lógica de agrupamento por dia (histórico, lançamento retroativo) extrai a data no fuso local do usuário — nunca faz `.slice(0, 10)` direto no ISO UTC.
- As funções `startOfDayISO(dateISO)` e `endOfDayISO(dateISO)` constroem limites UTC a partir do horário local: `new Date(dateISO + "T00:00:00").toISOString()`.

### 6.7 Tarefas recorrentes
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

**O que não testamos (e por quê):**
- Componentes React — requereria `@testing-library/react`, não configurado
- `GoogleCalendarImporter` / `GoogleSheetsTaskSender` — dependem de `fetch` externo
- Contexts React (`RunningTaskContext`) — acoplados ao runtime Tauri e DOM

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

### 8.3 Estado
- Estado local com `useState`/`useReducer` para UI.
- Estado global (tarefa em execução, configurações) via Context API ou estado gerenciado (avaliar Zustand se complexidade crescer).
- Dados persistentes via repositórios (Clean Architecture).

### 8.4 Estilização
- Tailwind CSS como padrão. Sem CSS modules ou styled-components.
- Temas implementados via CSS custom properties controladas pela configuração de tema.
- Tamanhos de fonte escalados via variável CSS controlada pela configuração de acessibilidade.

---

## 9. PRIORIDADE DE IMPLEMENTAÇÃO SUGERIDA

> Esta é a ordem sugerida para desenvolvimento incremental. Cada fase deve resultar em um app funcional.

| Fase | Status | Escopo |
|---|---|---|
| 1 — Fundação | ✅ concluída | Setup Tauri + React + TS + Tailwind + SQLite + Clean Architecture scaffold. CRUD de Project e Category. Tela de Dados funcional. |
| 2 — Core Timer | ✅ concluída | Entidade Task + timer + execução/pausa/stop. Tela de Tarefas (seções 1, 3, 4). Execution Overlay básico. |
| 3 — Planejamento | ✅ concluída | PlannedTask + Tela de Planejamento (hoje + semana). Planning Overlay + Compact Overlay. |
| 4 — Histórico | ✅ concluída | Tela de Histórico com filtros e agrupamento por dia (local timezone). |
| 5 — Export | ✅ concluída | Perfis de exportação + CSV/XLSX/JSON + seleção de colunas. |
| 6 — Overlays completos | ✅ concluída | Comportamentos de arrastar, snap-to-grid, persistência de posição, opacidade. Welcome Overlay removido — substituído pelo Command Palette. |
| 7 — Configurações | ✅ concluída | Tela de Configurações. Atalhos globais. Acessibilidade (tamanho de fonte). Tray icon. Autostart. Temas (Azul, Verde, Escuro, Claro). |
| 8 — Integrações | ✅ concluída | ✅ Modo de envio (UI + ITaskSender). ✅ Tela de Integrações (conector Google unificado). ✅ Google Sheets OAuth + sender + auto-sync ao concluir tarefa. ✅ Google Calendar: importação com editor inline, recorrência via RRULE, filtro de eventos não relevantes. |
| 9 — Polish | ✅ concluída | ✅ Lançamento retroativo. ✅ Feedback link. ✅ Ações de tarefa (open URL/file). ✅ Build multiplataforma + CI/CD. ✅ README final. |
| 10 — API Local + Command Palette | ✅ concluída | ✅ API REST local (axum + utoipa) com Swagger UI. ✅ CRUD de tarefas planejadas via API. ✅ Command Palette (Ctrl+K) substituindo Welcome Overlay. ✅ Busca fuzzy + atalhos Ctrl+1–7. ✅ Startup: CP + compact overlay simultâneos. |

---

## 10. GLOSSÁRIO

| Termo | Definição |
|---|---|
| Task | Registro de hora efetivamente trabalhada, com start/end time. |
| PlannedTask | Tarefa agendada para execução futura, sem timer associado até ser iniciada. |
| Billable | Tarefa que será cobrada/faturada do cliente. |
| Overlay | Janela flutuante acima de todas as outras janelas do SO. |
| Execution Overlay | Overlay que mostra o timer da tarefa em execução. |
| Planning Overlay | Overlay que lista tarefas planejadas para hoje. |
| Compact Overlay | Versão minimizada do Planning Overlay (apenas ícone + badge). |
| Command Palette | Painel flutuante de acesso rápido (Ctrl+K): iniciar tarefa, navegar, ver tarefas planejadas do dia. Substituiu o Welcome Overlay. |
| API Local | Servidor HTTP embutido (axum, porta 27420) que expõe a API REST do DeskClock para integrações externas. |
| Modo de envio | Estado da UI onde o usuário seleciona tarefas para enviar a uma integração externa. |
| Ação (PlannedTask) | Automação executada ao iniciar uma tarefa planejada (abrir URL, abrir arquivo). |
| Perfil de exportação | Configuração salva que define formato, colunas e opções de um export. |

---

## 11. REGISTRO DE DECISÕES

> Adicione aqui toda decisão técnica ou de produto tomada durante o desenvolvimento.

| Data | Decisão | Contexto |
|---|---|---|
| — | Documento criado | Especificação inicial do projeto |
| 08/04/2026 | Use cases como funções puras (não classes) | Testabilidade máxima; repositório injetado como argumento, sem IoC container |
| 08/04/2026 | UUID gerado no frontend via `uuid` lib | Schema SQL simples (sem AUTOINCREMENT), compatível com arquitetura offline-first |
| 08/04/2026 | Tailwind CSS v4 com `@import "tailwindcss"` | Sem `tailwind.config.js`; configuração via CSS custom properties e `@theme` se necessário |
| 08/04/2026 | ESLint 9 flat config (`.mjs`) | Evita conflito com `"type": "module"` no package.json |
| 08/04/2026 | Build script: `tsc --noEmit && vite build` | Evita complexidade de project references (`tsc -b`); Vite transpila TS internamente |
| 08/04/2026 | Mock de `@tauri-apps/plugin-sql` em `tests/setup.ts` | Plugin não funciona fora do runtime Tauri; testes de repositório mockam `getDb()` via `vi.mock("@infra/database/db")` |
| 08/04/2026 | `default_billable` armazenado como INTEGER 0/1 no SQLite | SQLite não tem tipo BOOLEAN nativo; conversão feita na camada infra |
| 09/04/2026 | Lançamento retroativo como tela dedicada (não modal) | Modal limitava entrada em sequência; tela dedicada com cadeia de horários permite registrar um bloco de trabalho retroativo muito mais rápido |
| 09/04/2026 | Data local do `startTime` como referência da tarefa | Usar `.slice(0,10)` no ISO UTC causava atribuição errada do dia em fusos UTC+; `startOfDayISO`/`endOfDayISO` agora convertem data local → UTC |
| 09/04/2026 | Feedback como botão na sidebar (não em configurações) | Acesso com um clique sem navegar até a tela de configurações; usa `tauri-plugin-opener` |
| 09/04/2026 | `EditTaskModal` edita hora início + hora fim (não duração) | A duração é derivada; editar os dois extremos é mais intuitivo e evita ambiguidade. ESC fecha, Enter salva |
| 09/04/2026 | Integrações como tela separada na sidebar (não seção em Configurações) | Integrações têm complexidade própria (OAuth, config por integração); tela dedicada dá mais espaço e mantém Configurações focada em preferências do app |
| 09/04/2026 | OAuth via Authorization Code + client_secret (não PKCE) | Credenciais em variável de ambiente (`GCP_CLIENT_ID`, `GCP_CLIENT_SECRET`), injetadas via Vite envPrefix. Aceitável para desktop app instalável |
| 09/04/2026 | Servidor OAuth: `std::net::TcpListener` em thread separada (não tokio async) | Mais simples, sem dependência nova. Porta aleatória; emite evento `oauth_callback_received` para o frontend ao receber o redirect |
| 09/04/2026 | Tokens OAuth salvos no Config (SQLite) | MVP: aceitável. Upgrade futuro: `tauri-plugin-stronghold` para armazenamento seguro |
| 09/04/2026 | `ITaskSender` no domain — integrações expansíveis | Novas integrações (Jira, API própria, Notion…) implementam a interface em `infra/integrations/` sem alterar domain ou UI |
| 09/04/2026 | Modo de envio: seleção por grupo (não por tarefa individual) | Grupos são a unidade semântica de envio; selecionar por tarefa individual dentro do grupo seria overengineering para o caso de uso principal |
| 09/04/2026 | Duração enviada ao Sheets como fração de dia (`durationSeconds / 86400`) | Permite que a planilha aplique formato `[hh]:mm` ou `[hh]:mm:ss` nativamente via `batchUpdate` com `numberFormat` tipo TIME |
| 09/04/2026 | Conector Google único para Sheets + Calendar | Tokens compartilhados com `ALL_GOOGLE_SCOPES`; evita conflito de tokens ao conectar serviços separados |
| 09/04/2026 | Auto-sync centralizado em `RunningTaskContext` (janela main) | Overlay emite `TASK_STOPPED` com a `Task` completa; main escuta e executa o sync — garante acesso ao config e evita duplicação |
| 09/04/2026 | `parseRRuleDays` extraído para `infra/integrations/google/rrule.ts` | Testabilidade: função pura isolada do `GoogleCalendarImporter` que depende de `fetch` |
| 09/04/2026 | Planejamento sem visão "Hoje" — apenas visão Semana | A visão Semana com filtro por dia e botão "Hoje" no campo de data é suficiente; remover "Hoje" simplifica a navegação |
| 15/04/2026 | `standard-version` com `bumpFiles` para sincronizar `tauri.conf.json` | Substituiu o `postbump` script que não fazia stage do arquivo; `bumpFiles` atualiza e faz stage atomicamente junto com `package.json` |
| 15/04/2026 | Overlays HWND_TOPMOST via `SetWinEventHook` + `SetWindowPos` direto (Windows) | `set_always_on_top` do Tauri usa `SWP_ASYNCWINDOWPOS` que o OS descarta como no-op; `SetWindowPos` síncrono re-afirma TOPMOST ao `EVENT_SYSTEM_FOREGROUND` — zero CPU em idle, sem polling |
| 15/04/2026 | `PLANNED_TASKS_CHANGED` como evento Tauri cross-window | Overlay e janela principal vivem em processos JS separados; evento emitido após toda mutação de `usePlannedTasksForWeek` garante que `usePlannedTasksForDate` no overlay recarregue sem polling |
| 15/04/2026 | `plannedTaskId` propagado no flow start→stop para auto-completar PlannedTask | Ao confirmar "Concluída? → Sim" no execution overlay, a PlannedTask associada recebe a data atual em `completedDates` — sem campo extra na entidade `Task`, rastreado apenas em estado de sessão |
| 17/04/2026 | Guard `runningTask` no play da tela de planejamento e no `RunningTaskContext` | Evita iniciar múltiplas tarefas simultâneas; `isStartingRef` foi descartado pois trata duplo-clique mas não o caso semântico de tarefa já em execução |
| 17/04/2026 | Ações de tarefa planejada executadas antes de `startTask` na tela de planejamento | `executeActions` estava ausente em `WeekPlanningView`; adicionado com `plannedTaskId` para completar o fluxo |
| 17/04/2026 | `CREATE_NO_WINDOW` nas chamadas de shell no Windows | Evita janela de terminal piscando na tela ao abrir URL/arquivo via `open_in_browser` e `open_in_file_manager` |
| 17/04/2026 | Modo de envio: clique na linha inteira alterna checkbox | Extraído para `handleRowClick` nomeado em `TaskGroupCard`; condição `!isGroup && !selectable` evita renderização dupla de tarefa individual |
| 17/04/2026 | ESC em edição inline usa `stopPropagation` no container do form | Sem `stopPropagation`, o ESC propagava até um handler global que fechava a janela; corrigido em `PlannedTaskItem` e `RunningTaskEditForm` |
| 17/04/2026 | `target.isConnected` check no `handleOutside` do `PlannedTaskItem` | React (event delegation no root) executa `onMouseDown` do `<li>` e re-renderiza antes de o evento nativo chegar ao `document`; o `<li>` é removido do DOM (`isConnected: false`) e `formRef.contains()` retornava false erroneamente — ignorar nós desconectados resolve |
| 17/04/2026 | Overlay `resizable: true` + `minWidth/minHeight: 1` no Linux/GTK | `resizable: false` faz o GTK definir WM hints `PMinSize == PMaxSize == current_size`, impedindo `setSize()` programático de reduzir abaixo de ~200px. `resizable: true` com `decorations: false` remove as handles visuais mantendo redimensionamento livre |
| 17/04/2026 | `monitor.workArea` para posicionar janelas perto da barra de tarefas | `workArea` já exclui qualquer painel/taskbar independente de posição (topo, base, lados). Mais confiável que `window.screen.availWidth/availHeight` no WebKitGTK |
| 17/04/2026 | `currentMonitor()` retorna `null` para janelas ocultas no GTK — fallback para `primaryMonitor()` | Janelas ocultas/não realizadas não são associadas a monitor pelo GTK. Sem fallback, `positionNearTaskbar` saía cedo sem posicionar. Resolvido com `currentMonitor().then(m => m ?? primaryMonitor())` |
| 17/04/2026 | Retry de 150ms para `setPosition` no GTK | `setPosition()` falha silenciosamente em janelas ainda não realizadas pelo compositor. Tentativa imediata + `setTimeout(150ms)` resolve sem polling |
| 17/04/2026 | `mainWindowPosition` persistida no Config (SQLite) | Salva a posição da janela principal via debounce em `tauri://move`; restaurada no próximo startup antes de chamar `appWindow.show()`. Fallback para `positionNearTaskbar` se não há posição salva |
| 17/04/2026 | `get_display_server` command detecta Wayland vs X11 | Lê `WAYLAND_DISPLAY` env var. Exibe aviso na UI de atalhos quando em Wayland (onde `XGrabKey` não funciona). `update_shortcuts` retorna `Vec<String>` com os atalhos que falharam ao registrar |
| 17/04/2026 | Tela de erro ao falhar carregamento das configurações | `ConfigContext` captura exceção no load e expõe `loadError: string \| null`. `AppInner` detecta após `isLoaded` e renderiza tela com código do erro e botão de reinicialização via `relaunch_app` |
| 18/04/2026 | `setMinSize`/`setMaxSize` para travar resize dos overlays (não `setResizable`) | `setResizable(false)` quebra entrega de eventos de mouse no GTK em janelas pequenas (52×52). `setMinSize(w,h)` + `setMaxSize(w,h)` define os mesmos WM hints sem alterar o flag `resizable`, preservando o comportamento de cliques. Para redimensionamento programático: zera min/max → setSize → reloca min/max. |
| 18/04/2026 | Welcome Overlay substituído por Command Palette (`Ctrl+K`) | CP unifica acesso rápido (iniciar tarefa, navegar, tarefas planejadas do dia) sem ocupar espaço permanente na UI. Busca fuzzy com score + highlight. |
| 18/04/2026 | Startup: mostrar overlay antes do Command Palette | `overlay.show()` rouba foco do CP se executado depois; invertendo a ordem (overlay primeiro, CP por último com `setFocus()`) o CP mantém foco e não fecha pelo listener `tauri://blur`. |
| 18/04/2026 | `null` body em axum rejeitado com `Option<Json<T>>` — fix via `Bytes` + helper | axum tenta desserializar `null` como o struct e falha. Solução: extrator `Bytes` + `parse_optional_body()` que trata corpo vazio ou `null` como `None`. Aplicado em `post_stop` e `post_toggle`. |
| 18/04/2026 | Axum 0.8 usa `{param}` em vez de `:param` nas rotas | Quebra em runtime com panic; corrigido trocando `:id` por `{id}` e `:date` por `{date}` em `routes.rs`. |
| 18/04/2026 | CRUD de tarefas planejadas na API local | 7 endpoints: lista (com filtro por data + regras de recorrência em Rust), get, create, update (PUT), delete, marcar/desmarcar conclusão. `completed_dates`, `recurring_days` e `actions` são JSON strings no SQLite serializados/desserializados na camada API. |
| 19/04/2026 | `opener:allow-open-url` requer scope explícito para HTTP | Sem scope, apenas HTTPS é permitido. `http://localhost` (Swagger UI) exige objeto `allow` com `{ "url": "http://localhost:*/**" }` em `capabilities/default.json`. |

---

*Última atualização: 19/04/2026*