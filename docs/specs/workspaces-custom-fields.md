# Workspaces, custom fields e expansão da integração Monday

- **Date:** 2026-07-30
- **Author:** Eduardo Meira
- **Project classification:** Current (React 19, TS 5, Vitest 3, CLAUDE.md + CI presentes)
- **Coverage tier:** A (`domain/usecases/`, repositórios, migrations) / B–C (UI, sem testes de
  renderização — padrão do projeto, §7.6 do `CLAUDE.md`)
- **Estado do ritual SDD:** Brainstorm ✅ · Plan ✅ · **Execute em andamento** — Fases 0 e 1
  concluídas em 2026-07-30; Fases 2 a 5 pendentes

> Este documento é a **ordem de trabalho** para a fase de Execute. Foi escrito para ser lido
> por um agente sem acesso à conversa que o originou — todas as decisões e o porquê delas
> estão aqui.

---

## Handoff — leia antes de tocar em qualquer coisa

> Os itens 1 a 3 originais (Monday sem commit, índice do GitNexus desatualizado, spike bloqueante)
> foram resolvidos em 2026-07-30. O que segue valendo:

1. **Branch:** seguir em `feat/monday-integration`. O nome ficou menor que o escopo.
2. **A migration 011 já roda.** Ela renomeia `projects`/`categories` para `*_pre_011` e reconstrói
   `tasks`/`planned_tasks`/`export_profiles`. As tabelas `_pre_011` ficam no banco de propósito:
   são a única rota de rollback. Ver §1.0 para o porquê da técnica.
3. **A paleta de cores vem do Tailwind v4**, que expõe 26 slots como CSS custom properties. Um
   grep em `src/index.css` mostra só 4 porque ali ficam apenas os *overrides* de tema — não
   conclua que a paleta é pequena.
4. **`workspaceId` é ambíguo no código.** Em `importMondayProjects` e `ClockifyMappingsSection`
   ele designa o workspace do **Monday/Clockify**; o do DeskClock nesses arquivos chama-se
   `deskclockWorkspaceId`.

---

## Problem & constraints

### Problema

Sete mudanças pedidas que parecem independentes e não são:

1. Importar atividades do Monday para dentro do DeskClock.
2. Cadastro de projetos/categorias é global e plano — cada integração disputa o mesmo balaio.
3. Alternar entre contextos facilmente; integrações são externas ao workspace e enxergam tudo.
4. Workspaces dinâmicos; usuários existentes ganham um workspace "Padrão" com todo o legado.
5. Workspace = id, nome e cor (derivada do hash do nome, editável).
6. Multi-select na tela de Dados para exclusão em massa.
7. Custom fields na tarefa (Text, Multiline, Select, Checkbox) além dos campos de sistema.

O encadeamento real:

- **O item 7 é pré-requisito do item 1.** Hoje "Project Stage" está modelado como
  `projectStageLabel` dentro de `MondayCategoryMapping`, ou seja, como atributo da categoria.
  Não é: é um campo próprio da atividade. Sem custom fields, o mapeamento continua torto.
- **O item 2 é pré-requisito de tudo.** Muda a chave de unicidade das duas tabelas mais
  referenciadas do banco (`projects.name UNIQUE`, `categories.name UNIQUE`).

### Restrições

**A favor:**

- Todo o SQL de projetos/categorias está confinado a `ProjectRepository.ts` e
  `CategoryRepository.ts`. Toda a UI passa por `useProjects`/`useCategories`. O ponto de corte
  para escopar por workspace é pequeno e único.
- A integração Monday **não tem base instalada** (nenhum commit). `MondayCategoryMapping` pode
  ser remodelado sem back-compat.
- `AutoSyncControls`, `TaskSendModal`, `useTaskSendSelection`, `ClockifyEntriesModal` e
  `ImportCalendarModal` já existem como trilhos genéricos (§9.4 do `CLAUDE.md`).

**Contra — riscos que sobreviveram ao brainstorm:**

1. **A migration de `projects`/`categories` é a única parte sem rede.** Trocar `name UNIQUE`
   por `UNIQUE(workspace_id, name)` exige recriar a tabela no SQLite. Com
   `PRAGMA foreign_keys = ON` (ativo em `001_initial_schema.sql`), `DROP TABLE projects`
   dispara o `ON DELETE SET NULL` de `tasks.project_id` e **desvincula todo o histórico em
   silêncio**. E `PRAGMA foreign_keys` é no-op dentro de transação, que é como o sqlx
   (tauri-plugin-sql) roda migrations.
2. **`taskGroupKey` precisa absorver os custom fields.** É `nome|projeto|categoria`. Se Project
   Stage vira custom field e não entra na chave, duas tarefas com stages diferentes colapsam num
   item só do Monday e o valor gravado depende da ordem de chegada — exatamente o defeito que
   obrigou `billable` a entrar na assinatura de `groupTasksForMonday`.
3. **A regra do board interno único** só é aplicável se `mondayInternalBoardId` for persistido à
   parte: depois do import, ele é indistinguível de um board de cliente dentro de
   `mondayProjectMapping`.
4. **`ExportProfile.is_default`** passa a ser único por workspace, não global.

### Blast radius (GitNexus, `direction: upstream`)

| Símbolo | Risco | Diretos |
|---|---|---|
| `useProjects` | 🔴 **CRITICAL** | 13 chamadores, 12 execution flows, 4 módulos |
| `ProjectRepository` | LOW (1 direto) | 28 arquivos transitivos via `RepositoriesContext` |
| `groupTasks` | LOW | 4 diretos: `useTasks`, `useTaskSendSelection`, `runDailyTemplate`, `ExportModal` |

O `useProjects` em CRITICAL dita a estratégia da Fase 1: **a assinatura do hook não muda.** Ele
passa a ler o workspace ativo de um contexto e os 13 chamadores não são tocados. Trocar para
`useProjects(workspaceId)` significaria editar 13 arquivos em 12 fluxos por ganho zero.

---

## Decisões fechadas

| Tema | Decisão |
|---|---|
| Escopo do workspace | Tarefas, planejadas, projetos, categorias e perfis de exportação |
| Custom fields | **Globais**, não escopados — ver justificativa abaixo |
| Workspace "Padrão" | Criado na migration com id sentinela fixo, backfill de tudo, coluna `NOT NULL` |
| Excluir workspace | Modal escolhe o destino dos dados. **Exceção deliberada** ao §1 "exclusões sem confirmação" — apagar meses de horas é irreversível demais. Registrar a exceção no `CLAUDE.md` |
| Troca com tarefa rodando | **Bloqueia** e oferece "Parar e trocar", reusando o painel Concluída/Pendente existente |
| Corrigir workspace errado | "Mover para workspace" e "Copiar para workspace", com modal reconciliando projeto e categoria |
| Destino de import | Workspace ativo pré-selecionado, com seletor no modal |
| Monday — pasta "Projetos" | Todos os boards → um Project cada, mapeamento 1:1, como já é hoje |
| Monday — pasta "Projetos Internos" | **Um único** board escolhido pelo usuário → vira um Project. Granularidade interna vem da **categoria**. Vincular outro substitui o anterior |
| Monday — importar atividades | Duas vias que **não se cruzam**: itens de trabalho → PlannedTasks; itens de Activities → modal de gerenciamento (ver/editar/excluir no Monday). Nada do Monday vira tarefa realizada no DeskClock |

### Por que custom fields são globais

Decisão do usuário, com razão estrutural que emergiu depois: **mover uma tarefa entre workspaces
só é viável se o valor do campo sobreviver sem reconciliação.** Projeto e categoria são escopados,
então mover exige remapear os dois. Se os custom fields também fossem escopados, mover exigiria
reconciliar campo *e* opção de select, triplicando a complexidade do modal.

Custo aceito: "Project Stage" (que só existe por causa do Monday) aparece no formulário de toda
tarefa de todo workspace. Se incomodar no uso, a evolução barata é manter a definição global e dar
ao campo uma lista de workspaces onde ele aparece — **fora do escopo desta entrega**.

### Por que o board interno é um Project (e não um fallback)

Modelagem do usuário: "Tech Atividades Internas" **é** um projeto, e a granularidade dentro dele
vem da categoria (Reunião, Recrutamento, Estudo…). Isso mantém o mapeamento **1:1 uniforme** e
dispensa flag de "projeto interno" e board padrão de fallback. A restrição de área ("só devo enviar
para o board da minha área") vira uma regra de import — vincular um board interno substitui o
anterior —, não uma decisão por projeto.

Uma proposta alternativa de três estados por projeto (mapeado / interno / não mapeado, com board
padrão de fallback) foi considerada e **descartada** por ser mais complexa que a necessária.

---

## Alternatives considered

| Decisão | Alternativa descartada | Motivo |
|---|---|---|
| Escopo do workspace | Filtro ambiente dentro do repositório (todo `findAll` já filtra) | Quebraria o requisito de integrações verem tudo, e em silêncio |
| Workspace "Padrão" | `workspace_id NULL` = Padrão virtual | Duas representações do mesmo estado — fonte garantida de bug |
| Custom fields | Coluna JSON em `tasks.custom_values` | Inviabiliza filtro no histórico e agrupamento em SQL puro |
| Monday, board interno | Board padrão de fallback + três estados por projeto | Resolvido pela modelagem 1:1, mais simples |
| Monday, import | Importar itens de Activities como tarefas realizadas | Sync circular: o DeskClock cria esses itens; reimportá-los duplicaria tarefas que seriam reenviadas |
| Assinatura do hook | `useProjects(workspaceId)` | `useProjects` está em CRITICAL: 13 arquivos editados em 12 fluxos por ganho zero |
| Entrega | Um PR único com os 7 itens | Diff irrevisável |

---

## Plan

### Fase 0 — Consolidar o Monday-send

1. `npx gitnexus analyze` — destrava o impact analysis das fases seguintes.
2. `pnpm test` + `pnpm lint` + `pnpm format` no que já existe.
3. Gate `@code-quality-reviewer` sobre o diff atual.
4. Commit `feat(monday): integração de envio de horas ao Monday.com`.
5. Marcar em `docs/specs/monday-integration.md` os dois checkboxes de governança do
   `mondayApiKey` (registro em `Coaktion/security-inventory`) — hoje abertos e declarados como
   bloqueio de merge.

**Sem código novo.** É empacotar o que existe.

---

### Fase 1 — Workspaces ✅ **CONCLUÍDA em 2026-07-30**

#### 1.0 Spike da migration — ✅ **CONCLUÍDO em 2026-07-30**

Executado contra dois bancos: um fixture sintético (500 tarefas, 60 planejadas, 20 projetos, 10
categorias, todas com FK preenchida) e uma cópia do banco real (4 tarefas, 101 projetos, incluindo
uma tarefa com `project_id` nulo). O harness replica a semântica do sqlx: conexão com
`foreign_keys = ON` (default do `SqliteConnectOptions`) e uma transação por migration.

**As duas técnicas preferidas do plano original foram refutadas:**

| Técnica | Resultado |
|---|---|
| (a) `PRAGMA legacy_alter_table = ON` + `RENAME` | ❌ O pragma é aceito (lê `1` dentro e fora de transação), mas com `foreign_keys = ON` o `RENAME` reescreve as cláusulas `REFERENCES` das filhas mesmo assim: `tasks.project_id` passou a apontar para `projects_pre_011`. Só preserva as cláusulas se `foreign_keys = OFF` |
| (b) `PRAGMA foreign_keys = OFF` | ❌ Confirmado no-op dentro de transação (lê `1` depois de `OFF`). Indisponível no runner do sqlx |
| Ingênua (`CREATE` novo + `DROP` antigo) | ❌ **Roda sem erro nenhum** e zera `project_id` de 500 tarefas e 60 planejadas. O risco do plano está reproduzido |

**Técnica adotada — reconstruir as quatro tabelas.** `projects`/`categories` são apenas
**renomeadas** (rename não apaga dado; a reescrita das cláusulas FK é temporária e irrelevante) e
em seguida `tasks`, `planned_tasks` e `export_profiles` são **reconstruídas** — nelas o `DROP` é
seguro porque nenhuma tabela as referencia. A reconstrução reescreve as cláusulas `REFERENCES`
apontando de volta para `projects`/`categories` novos.

**Terceiro achado, não previsto no plano:** o SQLite proíbe
`ALTER TABLE … ADD COLUMN workspace_id … REFERENCES workspaces(id) NOT NULL DEFAULT '<sentinela>'`
("Cannot add a REFERENCES column with non-NULL default value"). O `ADD COLUMN` da §1.1 original é
inexequível — daí `export_profiles` também precisar de reconstrução.

**Critério de saída atendido** — 17 asserções verdes, incluindo: `foreign_key_check` vazio,
`integrity_check ok`, as 500 tarefas e 60 planejadas resolvendo para **o mesmo** projeto e categoria
por id (não só contagem igual), cláusulas `REFERENCES` no alvo certo, projeto criado *depois* da
migration aceitando tarefa (o cenário que quebrou na técnica (a)), `UNIQUE(workspace_id, name)`
aceitando nome repetido entre workspaces e rejeitando dentro do mesmo, `is_default` único por
workspace, `ON DELETE SET NULL` preservado e as tabelas `_pre_011` intactas e não referenciadas.

> **Custo assumido:** a 011 replica o schema de `tasks`/`planned_tasks`/`export_profiles` tal como
> está após a 010. Alterar retroativamente qualquer migration anterior exige acompanhar este arquivo.

#### 1.1 Migration `011_workspaces.sql` (version 11 em `src-tauri/src/migrations.rs`)

Ordem exata validada pelo spike (o SQL candidato já passou nos dois bancos):

```
workspaces(id PK, name UNIQUE, color, created_at)
  → seed 'Padrão', id sentinela '00000000-0000-4000-8000-000000000001'
    (constante compartilhada com o código)
projects / categories
  → RENAME para projects_pre_011 / categories_pre_011  (sem DROP)
  → CREATE novo com workspace_id NOT NULL REFERENCES workspaces(id)
    e UNIQUE(workspace_id, name); INSERT … SELECT do _pre_011
tasks / planned_tasks / export_profiles
  → CREATE <tabela>_new replicando o schema pós-010 + workspace_id
  → INSERT … SELECT, DROP da antiga (seguro: ninguém as referencia), RENAME
  → recriar os índices, que somem junto com a tabela
export_profiles.is_default
  → CREATE UNIQUE INDEX … ON export_profiles(workspace_id) WHERE is_default = 1
```

As tabelas `_pre_011` ficam no banco de propósito: são a única rota de rollback desta migration.

#### 1.2 Domain

| Arquivo | Conteúdo |
|---|---|
| `domain/entities/Workspace.ts` | `{ id, name, color, createdAt }` |
| `domain/repositories/IWorkspaceRepository.ts` | `findAll`, `findById`, `save`, `update`, `delete` |
| `domain/utils/workspaceColor.ts` | hash do nome → **slot** da paleta do Tailwind v4 (26 disponíveis como CSS custom properties; 8 curados, excluindo os accents de tema e os neutros). Guarda nome de slot, nunca valor de cor. A tradução para classe fica em `presentation/components/WorkspaceDot.tsx`, num mapa escrito por extenso — `bg-${slot}-500` montado em runtime não geraria CSS |
| `domain/usecases/workspaces/` | `CreateWorkspace`, `UpdateWorkspace`, `DeleteWorkspace(id, targetId)`, `GetWorkspaces` |
| `domain/usecases/tasks/MoveTasksToWorkspace.ts` | move/copia + aplica reconciliação |
| `domain/usecases/workspaces/reconcileCatalog.ts` | dado projeto/categoria de origem e o catálogo do destino, devolve `match` \| `create` \| `unset` |

#### 1.3 Escopo nos repositórios

- `findAll(workspaceId?)` — **`undefined` = todos**, que é o caminho das integrações (item 3).
- `findByName(name, workspaceId)` — parâmetro **obrigatório**, porque a unicidade agora é por
  workspace.

Atingidos: `IProjectRepository`, `ICategoryRepository`, `ITaskRepository.findByDateRange`,
`IPlannedTaskRepository`, `IExportProfileRepository` + as 5 implementações em `infra/database/`.
`WorkspaceRepository` novo, registrado em `RepositoriesContext`.

#### 1.4 Presentation

- **`contexts/WorkspaceContext.tsx`** — lista, `activeWorkspaceId` (persistido em
  `AppConfig.activeWorkspaceId`), `switchTo()`. É daqui que os hooks leem — é por isso que
  nenhuma assinatura de hook muda.
- **Hooks tocados por dentro:** `useProjects`, `useCategories`, `useTasks`, `useHistory`,
  `usePlannedTasks`, `useExportProfiles`. Assinatura pública intacta.
- **`components/WorkspaceSwitcher.tsx`** na `Sidebar`. Com um único workspace, some da tela —
  quem não usa workspaces não vê workspace nenhum.
- **Guarda de tarefa em execução:** havendo tarefa rodando, abre o painel Concluída/Pendente e só
  então troca.
  > **Desvio aplicado no Execute:** a guarda ficou no `WorkspaceSwitcher`, **não** dentro de
  > `switchTo()`. O `RunningTaskContext` consome o `WorkspaceContext` para saber em que workspace
  > criar a tarefa; fazer `switchTo()` consultar o `RunningTaskContext` fecharia um ciclo entre os
  > dois providers. A sidebar está dentro de ambos, então decide sem acoplar nenhum dos dois.
- **`modals/MoveToWorkspaceModal.tsx`** — destino + reconciliação de projeto e categoria
  (`match` / `criar lá com o mesmo nome` / `deixar vazio`). Custom fields passam intactos.
  Modos mover e copiar. Pontos de entrada: card de grupo em "Entradas de hoje" (`TaskGroupCard`,
  que também cobre a tarefa única) e a seleção múltipla do histórico. Ambos só aparecem com mais
  de um workspace.
- **`modals/DeleteWorkspaceModal.tsx`** — destino dos dados.
- **`DataPage`** ganha aba "Workspaces" (CRUD + preview da cor gerada enquanto digita).

> Não é necessária uma "via global de lookup" de projeto/categoria por id: com a troca bloqueada
> durante execução, nenhuma tarefa é renderizada fora do seu workspace. Só o
> `MoveToWorkspaceModal` carrega os dois catálogos, e carrega explicitamente.

---

### Fase 2 — Multi-select na tela de Dados

1. `presentation/hooks/useMultiSelect.ts` — genérico por id. **Não copiar** a lógica de seleção
   de `useTaskSendSelection`, que é específica de tarefa (§9.4).
2. `IProjectRepository.deleteMany(ids)` / `ICategoryRepository.deleteMany(ids)` — segue o
   precedente de `ITaskRepository.deleteMany`.
3. `domain/usecases/projects/DeleteProjects.ts`, `domain/usecases/categories/DeleteCategories.ts`.
4. `ProjectsPanel` / `CategoriesPanel`: checkbox por linha, "Selecionar todos", barra de ação com
   exclusão em massa (sem confirmação, §1).

---

### Fase 3 — Custom fields

#### 3.1 Migration `012_custom_fields.sql` (version 12)

```
custom_fields(id PK, label, type CHECK(text|multiline|select|checkbox),
              options TEXT /* JSON */, sort_order, archived, created_at)
task_custom_values(task_id, field_id, value, PK(task_id, field_id))        ON DELETE CASCADE
planned_task_custom_values(planned_task_id, field_id, value, PK(...))      ON DELETE CASCADE
```

Sem `workspace_id`: campos são globais. `planned_task_custom_values` existe para que dar Play numa
tarefa planejada já traga o Project Stage preenchido.

#### 3.2 Domain

- `domain/entities/CustomField.ts`
- `domain/repositories/ICustomFieldRepository.ts` + `ICustomFieldValueRepository.ts`
- `domain/usecases/customFields/` — CRUD + `serializeCustomValue` / `parseCustomValue` por tipo
  (checkbox `"0"|"1"`, select = id da opção).
- `Task` e `PlannedTask` ganham `customValues: Record<UUID, string>`. Os repositórios costuram
  numa segunda query pelos ids já carregados — **sem N+1**.

#### 3.3 O ponto crítico: `taskGroupKey` (`domain/utils/groupTasks.ts`)

```
antes:  nome | projeto | categoria
depois: nome | projeto | categoria | valores custom em ordem estável de field id
```

Sem isso, duas tarefas com Project Stage diferente colapsam num item só do Monday e o valor
gravado depende da ordem de chegada. Propaga para os 4 chamadores de `groupTasks`
(`useTasks`, `useTaskSendSelection`, `runDailyTemplate`, `ExportModal`), para
`mondayGroupSignature` e para a ação "Unificar".

#### 3.4 UI

- `components/CustomFieldInputs.tsx` (renderiza por tipo), consumido por `EditTaskModal`,
  `RunningTaskEditForm`, `RetroactivePage`, `PlannedTaskForm`, `EditGroupModal`.
- CRUD dos campos numa aba "Campos personalizados" da `DataPage`.
- `ExportProfile.columns` aceita `field: "custom:<id>"` — exportação sem os campos novos seria um
  buraco visível no dia seguinte.

> `DataPage` chega a 4 abas (Projetos, Categorias, Workspaces, Campos). Ainda coerente, mas é o
> limite antes de virar tela-gaveta.

---

### Fase 4 — Monday adota o custom field

1. **`MondayCategoryMapping.projectStageLabel` sai.** Sem back-compat: a integração não tem base
   instalada.
2. `AppConfig`: `+ mondayProjectStageFieldId`, `+ mondayInternalBoardId`;
   `mondayProjectsFolderId` → `mondayClientsFolderId` + `mondayInternalFolderId`.
3. `MondayWorkspaceSection`: seleção das duas pastas + escolha do **board interno único**
   (escolher outro substitui o anterior).
4. `importMondayProjects`: pasta de clientes → um Project por board; pasta interna → um Project
   apenas para o board escolhido. Destino = workspace do seletor do modal.
5. `MondayMappingsSection`: ação "criar campo personalizado a partir da coluna Project Stage",
   semeando as opções do select com os labels do `settingsStr` do board — assim valor e label
   coincidem e não existe segunda tabela de mapeamento.
6. `MondayTaskSender` / `buildActivityColumnValues`: `projectStageLabel` passa a vir de
   `task.customValues[mondayProjectStageFieldId]`.

---

### Fase 5 — Importar e gerenciar atividades do Monday

1. `IMondayApi.listBoardItems(boardId, { groupId?, since? })` + tipo `MondayItem`; query
   `items_page` com paginação por cursor no `MondayClient`.
2. **`MondayImportModal`** (molde do `ImportCalendarModal`): board → itens **fora** do grupo
   Activities → seleção → PlannedTasks no workspace escolhido.
3. **`MondayEntriesModal`** (molde do `ClockifyEntriesModal`): período + boards mapeados → itens
   do Activities → editar e excluir direto no Monday.
4. **Detalhe que não pode escapar:** excluir um item pelo Entries precisa limpar a linha
   correspondente em `monday_activity_items`. Sem isso o próximo envio encontra rastreamento
   órfão e o `MondayNotFoundError` reaparece a cada execução.
5. Registro em `IntegrationsUiContext` + `IntegrationsModalsHost`.

---

## Estratégia de testes

| Alvo | Tier | Como |
|---|---|---|
| `workspaceColor`, `reconcileCatalog`, `MoveTasksToWorkspace`, use cases de workspace e custom field | A | Vitest puro |
| `WorkspaceRepository`, `CustomFieldRepository`, `deleteMany` | A | `getDb()` mockado via `vi.mock`, padrão dos existentes |
| `taskGroupKey` com custom values | A | Casos novos + **revisão de todos os asserts existentes** |
| `groupTasksForMonday`, `mondayGroupSignature`, `MondayTaskSender` | A | Atualizar suítes existentes |
| `importMondayProjects` com pasta interna | A | Novos casos |
| Migrations 011/012 | — | Não unit-testáveis: spike 1.0 + smoke em cópia do banco real |
| UI | B–C | Sem testes de renderização (§7.6) |

Suítes que já estão modificadas na árvore e mudam de novo: `taskValidation.test.ts`,
`IntegrationsContext.test.tsx`, `MondaySyncStrategy.test.ts`.

---

## Rollback

| Camada | Rota |
|---|---|
| Código | Um commit por fase → `git revert` isolado |
| Migration 012 | Aditiva. Dropar as três tabelas restaura o estado anterior |
| Migration 011 | **A única não trivial.** `projects_pre_011` / `categories_pre_011` ficam no banco justamente para isso; restauração é script manual |
| UX | Com um único workspace o switcher some — quem não criar workspaces não percebe diferença |
| Monday | Sem token configurado, `isPerTaskEnabled()` / `isDailyEnabled()` retornam `false` e nada roda |

---

## Ordem de execução

| # | Fase | Depende de |
|---|---|---|
| 0 | ✅ Commitar o Monday-send atual | — |
| 1 | ✅ Workspaces: schema, backfill, repos, seletor, escopo na UI, mover/copiar | — |
| 2 | Multi-select na tela de Dados | 1 |
| 3 | Custom fields: EAV, CRUD, captura na tarefa, chave de agrupamento | 1 |
| 4 | Monday: Project Stage vira custom field; board interno único | 3 |
| 5 | `MondayImportModal` + `MondayEntriesModal` | 4 |

Cada fase termina no gate obrigatório: `pnpm lint`, prettier, `@code-quality-reviewer` limpo,
Conventional Commit. Nenhum commit é proposto antes de um relatório limpo do sub-agente.

---

## Documentação a atualizar ao final

- `CLAUDE.md` — §4 (modelo de dados: Workspace, CustomField), §5.6 (tela de Dados com 4 abas e
  multi-select), §5.7 (integração Monday), §6 (nova regra de agrupamento com custom fields; a
  exceção de "exclusão sem confirmação" para workspaces), §9.5 (roteiro de nova integração).
- `README.md` — funcionalidades.
