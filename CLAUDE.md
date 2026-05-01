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

> **Arquitetura atual:** 2 janelas independentes — Compact Overlay (sempre visível) + Popup Flyout (aparece ao clicar). O Welcome Overlay foi substituído pelo Command Palette. O Execution Overlay foi unificado no Popup Flyout.

#### 5.1.1 Compact Overlay
- **Sempre visível** (always-on-top), arrastável, com persistência de posição.
- **Estado idle** (sem tarefa em execução): ícone do app + badge com contador de tarefas planejadas pendentes.
- **Estado running**: timer `MM:SS` pulsante substituindo o ícone; anel com glow animado no estilo da cor de status.
- **Estado paused**: indicador visual de pausa.
- **Clique:** abre o Popup Flyout. Se não há tarefa e não há planejadas, inicia nova tarefa em branco.
- **Grip bar** para arraste, com snap-to-grid opcional.

#### 5.1.2 Popup Flyout (Overlay de execução)
- **Aparece ao clicar** no Compact Overlay — flyout acoplado, não janela separada.
- **Estado idle:** lista de tarefas planejadas para hoje + botão "Nova tarefa". Botões: `Ir para planejamento` | `Fechar`.
- **Estado running/paused:** nome da tarefa, timer ao vivo, borda lateral colorida (billable/non-billable). Controles: Play/Pause, Stop (com confirmação Concluída/Pendente), Cancelar, Fechar.
- **Edição inline por campo:** clique em nome, projeto ou categoria abre edição in-place sem modal.
- **Hora de início** editável — recalcula o timer ao alterar.

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

## Fonte da verdade visual

- **Design system:** `.claude/design-system/`
- **Tokens CSS:** `.claude/design-system/colors_and_type.css` — tokens importados em `src/index.css`
- **UI de referência:** `.claude/design-system/ui_kits/deskclock/index.html` — abrir no navegador para comparação visual
- **Mapa de componentes:** `.claude/migration/component-map.md`
- **Mapa de tokens:** `.claude/migration/token-map.md`
- **Critérios de aceitação:** `.claude/migration/acceptance.md`

## Regras obrigatórias

1. **Zero hardcode visual.** Nunca crie cores, tamanhos, raios, sombras ou tipografias com valores literais. Use sempre variáveis CSS de `tokens.css`. Se precisar de um valor que não existe, pare e pergunte — não invente um novo.

2. **Mapa antes de código.** Ao tocar qualquer componente, consulte `component-map.md` primeiro para confirmar qual arquivo corresponde a qual bloco do design. Se não estiver no mapa, pare e peça para adicionar.

3. **Um componente por conversa.** Não refatore múltiplas telas/componentes na mesma mudança. Escopo pequeno é verificável.

4. **Screenshot diff é obrigatório.** Nenhuma mudança visual é "pronta" sem comparação screenshot do resultado vs. referência do design system.

5. **Ambiguidade pausa o trabalho.** Se encontrar conflito entre design e código existente (ex: props diferentes, dados diferentes, lógica conflitante), PARE e pergunte. Não adivinhe.

6. **Mudanças fora do escopo são rejeitadas.** Não "melhore" partes do código que não foram pedidas, mesmo que pareçam problemas óbvios. Documente em `.claude/migration/findings.md` e continue.

7. **Ordem de migração é fixa.** Siga a ordem de Fase 0 → 7 do `MIGRATION_GUIDE.md`. Não pule fases.

## Workflow padrão por tarefa

Antes de qualquer mudança:
- [ ] Ler o README do design system
- [ ] Ler `component-map.md` para o componente em questão
- [ ] Confirmar props preservadas e escopo
- [ ] Rodar a tela atual e tirar screenshot "antes"

Ao terminar:
- [ ] Tirar screenshot "depois"
- [ ] Comparar com referência do design system
- [ ] Preencher checklist de `acceptance.md` para o componente
- [ ] Listar no resumo do PR: (a) arquivos tocados, (b) checklist preenchido, (c) screenshot diff

## Critérios de "pronto" (universal)

Todo PR visual deve passar em:

- [ ] Zero valores hex/rgb fora de `tokens.css`
- [ ] Zero valores de espaçamento literal (px) fora de tokens
- [ ] Testes existentes passam
- [ ] Sem console warnings novos
- [ ] Screenshot diff anexado com < 2% de pixels divergentes (ou justificativa)
- [ ] Checklist de aceitação preenchido

## Tom e linguagem

- UI em **português (Brasil)**, sentence case, sem emoji, sem gírias
- Números: tempos em `HH:MM:SS`, durações compactas `1h30` ou `45m`
- Botões: verbo no infinitivo ("Iniciar", "Parar & salvar")
- Mensagens: curtas e informativas, nunca paternalistas

## Quando pedir ajuda humana

Pare e pergunte se:
- Correspondência de componente não está no mapa
- Token novo parece necessário
- Props antigas conflitam com estrutura nova
- Comportamento interativo ambíguo (ex: hover em mobile?)
- Mais de 3 divergências remanescentes após tentativa de fidelidade

---

*Última atualização: 28/04/2026*