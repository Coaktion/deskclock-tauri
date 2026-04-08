# CLAUDE.md — Especificação do Projeto DeskClock

> **Propósito deste documento:** Servir como fonte única de verdade para agentes de IA durante todo o ciclo de desenvolvimento. Toda decisão de implementação, arquitetura e design deve ser validada contra este documento. Atualize-o sempre que padrões ou decisões mudarem.

---

## 1. VISÃO GERAL DO PROJETO

**Nome:** DeskClock  
**Tipo:** Aplicativo desktop multiplataforma  
**Objetivo:** Registro de horas trabalhadas com flexibilidade total — o app se adapta ao modo de trabalho do usuário, não o contrário.

**Princípios de design:**
- Cadastros devem exigir o mínimo de cliques possível.
- Edições sempre em modais (exceto planejamento, que é inline).
- Exclusões sem confirmação — a ação é imediata.
- Overlays arrastáveis com persistência de posição.
- Atalhos globais para operações frequentes.

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
│   ├── pages/        # Tasks, Planning, History, Data, Settings
│   ├── components/   # Componentes reutilizáveis
│   ├── overlays/     # WelcomeOverlay, PlanningOverlay, CompactOverlay, ExecutionOverlay
│   ├── modals/       # Modais de edição
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

#### Seção 2 — Lançamento retroativo
- Botão que abre modal com campos: Nome, Projeto, Categoria, Billable, e duração.
- **Modo de duração:** Hora início + Hora fim, OU Hora início + Duração (app calcula hora fim).

#### Seção 3 — Tarefas planejadas para hoje
- Lista compacta: Nome + botão Play.
- Play inicia execução com dados da tarefa planejada preenchidos. Executa ações configuradas.

#### Seção 4 — Totalizadores
- Horas billable hoje | Horas non-billable hoje | Total semana com dias (ex: "15:00 2d").

#### Seção 5 — Entradas de hoje
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

**Toggle no topo:** Hoje | Semana

#### 5.3.1 Planejamento de Hoje
- **Header:** Data atual.
- **Formulário inline (sem modal):** Nome, Projeto (autocomplete, Enter seleciona primeiro item), Categoria (autocomplete, Enter seleciona primeiro item), Ações.
- **Ações por tarefa:** Array de `{ type: "open_url" | "open_file", value: string }`. URL auto-completa `https://` se ausente. N ações por tarefa.
- **Tecla Enter:** Se autocomplete fechado → cria a tarefa. Se autocomplete aberto → seleciona item.
- **Edição:** Inline. Salva ao perder foco se houve alteração.
- **Botões por tarefa:** Play | Concluir/Pendente | Duplicar | Ações (expandir/editar ações) | Excluir (sem confirmação).

#### 5.3.2 Planejamento da Semana
- **Header:** Intervalo da semana (ex: "06/04 — 12/04/2026") + navegação ← →.
- **Botões rápidos de dia:** Todos | Seg | Ter | Qua | Qui | Sex. Ao clicar em um dia, o campo Data do formulário é preenchido automaticamente.
- **Formulário:** Mesmos campos de "Hoje" + campo Data.
- **Tipos de Data:**
  - `specific_date`: Dia único.
  - `recurring`: Seleção de dias da semana. Sem data de término. Aparece até ser excluída.
  - `period`: Data início + Data fim. Aparece durante todo o período.
- **Importar Google Agenda:** Botão que puxa eventos do Google Calendar e cria PlannedTasks com nome e data preenchidos.

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
| Mostrar mensagem de boas-vindas | toggle | Exibe Welcome Overlay ao abrir |
| Como quer ser chamado? | text input | Nome exibido na mensagem de boas-vindas |

#### Overlay
| Configuração | Tipo | Descrição |
|---|---|---|
| Sempre visível | toggle | Overlay permanece visível após concluir tarefa, mostrando tarefas planejadas |
| Mostrar ao iniciar tarefa | toggle | Execution Overlay aparece ao iniciar tarefa |
| Opacidade em repouso | slider (%) | Opacidade do overlay quando não está em interação |
| Snap to grid | toggle | Encaixa overlay em grade ao soltar arraste |
| Mostrar indicador visual da grade | toggle | Exibe grid visual ao arrastar overlay |

#### Acessibilidade
| Configuração | Tipo | Descrição |
|---|---|---|
| Tamanho da fonte | select: P, M, G, GG | Escala texto e elementos da interface |
| Tema | select: Azul, Verde, Escuro, Claro | Paleta de cores da interface |

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
- Botão que abre URL externa no navegador padrão do usuário para envio de feedbacks, bugs, sugestões.

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
- Enter seleciona o primeiro item filtrado.
- Se nenhum resultado, permite texto livre (não cria projeto/categoria automaticamente).

### 6.5 Ações de tarefa planejada
- Ao iniciar uma tarefa planejada via Play, todas as ações configuradas são executadas em sequência.
- `open_url`: Abre URL no navegador padrão. Auto-prepend `https://` se não contiver `http://` ou `https://`.
- `open_file`: Abre arquivo/pasta no explorador de arquivos do SO.

### 6.6 Tarefas recorrentes
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
6. COMMITAR    → Commits semânticos (feat:, fix:, refactor:, test:, docs:, chore:).
7. MERGEAR     → Branch por feature → merge em main.
```

### 7.2 Regras de branch
- `main` → sempre estável e buildável.
- `feat/<nome>` → desenvolvimento de nova funcionalidade.
- `fix/<nome>` → correção de bug.
- `refactor/<nome>` → refatoração sem mudança de comportamento.

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

| Fase | Escopo |
|---|---|
| 1 — Fundação | Setup Tauri + React + TS + Tailwind + SQLite + Clean Architecture scaffold. CRUD de Project e Category. Tela de Dados funcional. |
| 2 — Core Timer | Entidade Task + timer + execução/pausa/stop. Tela de Tarefas (seções 1, 4, 5). Execution Overlay básico. |
| 3 — Planejamento | PlannedTask + Tela de Planejamento (hoje + semana). Planning Overlay + Compact Overlay. |
| 4 — Histórico | Tela de Histórico com filtros e agrupamento por dia. |
| 5 — Export | Perfis de exportação + CSV/XLSX/JSON + seleção de colunas. |
| 6 — Overlays completos | Welcome Overlay. Comportamentos de arrastar, snap-to-grid, persistência de posição, opacidade. |
| 7 — Configurações | Tela de Configurações completa. Atalhos globais. Acessibilidade (tema + fonte). Tray icon. |
| 8 — Integrações | Google Sheets (envio + sync automática). Google Calendar (importação). Modo de envio. |
| 9 — Polish | Lançamento retroativo. Ações de tarefa (open URL/file). Feedback link. Build multiplataforma. README final. |

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
| Modo de envio | Estado da UI onde o usuário seleciona tarefas para enviar a uma integração externa. |
| Ação (PlannedTask) | Automação executada ao iniciar uma tarefa planejada (abrir URL, abrir arquivo). |
| Perfil de exportação | Configuração salva que define formato, colunas e opções de um export. |

---

## 11. REGISTRO DE DECISÕES

> Adicione aqui toda decisão técnica ou de produto tomada durante o desenvolvimento.

| Data | Decisão | Contexto |
|---|---|---|
| — | Documento criado | Especificação inicial do projeto |

---

*Última atualização: 08/04/2026*